// Persistent Storage Manager
// Survives extension uninstall/reinstall using multiple storage methods

class PersistentStorage {
  constructor() {
    this.storageKey = 'superpower-gemini-data';
    this.version = '1.0';
  }

  // Save data to multiple persistent locations
  async saveData(data) {
    const storageData = {
      version: this.version,
      timestamp: Date.now(),
      data: data
    };

    const promises = [];

    // 1. Chrome storage (survives extension disable/enable)
    promises.push(this.saveToChromeStorage(storageData));

    // 2. localStorage (survives browser restart)
    promises.push(this.saveToLocalStorage(storageData));

    // 3. IndexedDB (more persistent than localStorage)
    promises.push(this.saveToIndexedDB(storageData));

    // 4. Download backup file (user can manually restore)
    if (data.prompts || data.conversations) {
      promises.push(this.createAutoBackup(storageData));
    }

    try {
      await Promise.allSettled(promises);
      console.log('Data saved to all persistent storage locations');
    } catch (error) {
      console.warn('Some storage methods failed:', error);
    }
  }

  // Load data from persistent storage (tries multiple sources)
  async loadData() {
    const sources = [
      () => this.loadFromChromeStorage(),
      () => this.loadFromLocalStorage(),
      () => this.loadFromIndexedDB()
    ];

    for (const loadMethod of sources) {
      try {
        const data = await loadMethod();
        if (data && data.data) {
          console.log('Data loaded from persistent storage');
          return data.data;
        }
      } catch (error) {
        console.warn('Storage load method failed:', error);
      }
    }

    console.log('No persistent data found, starting fresh');
    return null;
  }

  // Chrome storage methods
  async saveToChromeStorage(data) {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({ [this.storageKey]: data });
      // Also save to sync storage (limited but syncs across devices)
      try {
        const syncData = {
          ...data,
          data: {
            prompts: data.data.prompts || [],
            settings: data.data.settings || {}
          }
        };
        await chrome.storage.sync.set({ [this.storageKey]: syncData });
      } catch (syncError) {
        console.warn('Sync storage failed (data too large):', syncError);
      }
    }
  }

  async loadFromChromeStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get(this.storageKey);
      return result[this.storageKey];
    }
    return null;
  }

  // localStorage methods
  async saveToLocalStorage(data) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.warn('localStorage save failed:', error);
    }
  }

  async loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.warn('localStorage load failed:', error);
      return null;
    }
  }

  // IndexedDB methods (most persistent)
  async saveToIndexedDB(data) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('SuperpowerGeminiDB', 1);
      
      request.onerror = () => reject(request.error);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('data')) {
          db.createObjectStore('data', { keyPath: 'id' });
        }
      };
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['data'], 'readwrite');
        const store = transaction.objectStore('data');
        
        store.put({ id: this.storageKey, ...data });
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }

  async loadFromIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('SuperpowerGeminiDB', 1);
      
      request.onerror = () => resolve(null);
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('data')) {
          resolve(null);
          return;
        }
        
        const transaction = db.transaction(['data'], 'readonly');
        const store = transaction.objectStore('data');
        const getRequest = store.get(this.storageKey);
        
        getRequest.onsuccess = () => {
          const result = getRequest.result;
          resolve(result ? { data: result.data, version: result.version, timestamp: result.timestamp } : null);
        };
        
        getRequest.onerror = () => resolve(null);
      };
    });
  }

  // Auto-backup (creates downloadable backup files)
  async createAutoBackup(data) {
    try {
      const backupData = {
        ...data,
        backupType: 'auto',
        userAgent: navigator.userAgent,
        url: window.location.href
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Store backup URL in localStorage for later retrieval
      const backupInfo = {
        url: url,
        timestamp: Date.now(),
        size: blob.size
      };
      
      localStorage.setItem(this.storageKey + '_backup', JSON.stringify(backupInfo));
      
      // Optionally trigger download every 100 saves
      const saveCount = parseInt(localStorage.getItem(this.storageKey + '_saveCount') || '0') + 1;
      localStorage.setItem(this.storageKey + '_saveCount', saveCount.toString());
      
      if (saveCount % 100 === 0) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `superpower-gemini-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      
    } catch (error) {
      console.warn('Auto-backup failed:', error);
    }
  }

  // Export data for manual backup
  async exportData() {
    const data = await this.loadData();
    if (!data) {
      throw new Error('No data to export');
    }

    const exportData = {
      version: this.version,
      exportDate: new Date().toISOString(),
      data: data
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `superpower-gemini-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  // Import data from backup file
  async importData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const importData = JSON.parse(e.target.result);
          
          if (!importData.data) {
            throw new Error('Invalid backup file format');
          }
          
          await this.saveData(importData.data);
          resolve(importData.data);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('File reading failed'));
      reader.readAsText(file);
    });
  }

  // Clear all persistent data
  async clearData() {
    const promises = [
      this.clearChromeStorage(),
      this.clearLocalStorage(),
      this.clearIndexedDB()
    ];

    await Promise.allSettled(promises);
  }

  async clearChromeStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.remove(this.storageKey);
      await chrome.storage.sync.remove(this.storageKey);
    }
  }

  async clearLocalStorage() {
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem(this.storageKey + '_backup');
    localStorage.removeItem(this.storageKey + '_saveCount');
  }

  async clearIndexedDB() {
    return new Promise((resolve) => {
      const deleteRequest = indexedDB.deleteDatabase('SuperpowerGeminiDB');
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => resolve(); // Don't fail if DB doesn't exist
    });
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PersistentStorage;
} else {
  window.PersistentStorage = PersistentStorage;
}