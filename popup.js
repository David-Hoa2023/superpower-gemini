// Popup Script

// Function to find the best Gemini tab to use
async function findBestGeminiTab() {
  try {
    // Get current window information
    const currentWindow = await chrome.windows.getCurrent();
    
    // First, try to find Gemini tabs in the current window
    const sameWindowGeminiTabs = await chrome.tabs.query({ 
      url: 'https://gemini.google.com/*',
      windowId: currentWindow.id
    });
    
    if (sameWindowGeminiTabs.length > 0) {
      // Prefer the active tab in current window
      const activeTab = sameWindowGeminiTabs.find(tab => tab.active);
      return activeTab || sameWindowGeminiTabs[0];
    }
    
    // If no Gemini tabs in current window, find any Gemini tab
    const allGeminiTabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*' });
    
    if (allGeminiTabs.length > 0) {
      // Prefer active tabs
      const activeGeminiTab = allGeminiTabs.find(tab => tab.active);
      return activeGeminiTab || allGeminiTabs[0];
    }
    
    return null;
  } catch (error) {
    console.warn('Error finding Gemini tab:', error);
    // Fallback to simple query
    const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*' });
    return tabs.length > 0 ? tabs[0] : null;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Load current settings
  const settings = await chrome.storage.sync.get('settings');
  const currentSettings = settings.settings || {};
  
  // Apply settings to UI
  document.getElementById('auto-split').checked = currentSettings.autoSplit || false;
  document.getElementById('disable-enter').checked = currentSettings.disableEnterSubmit || false;
  document.getElementById('language').value = currentSettings.language || 'en';
  
  const widthSlider = document.getElementById('conv-width');
  const widthValue = document.getElementById('width-value');
  if (currentSettings.customWidth) {
    widthSlider.value = currentSettings.customWidth;
    widthValue.textContent = currentSettings.customWidth + 'px';
  }
  
  // Load statistics
  loadStatistics();
  
  // Event listeners
  document.getElementById('auto-split').addEventListener('change', (e) => {
    updateSetting('autoSplit', e.target.checked);
  });
  
  document.getElementById('disable-enter').addEventListener('change', (e) => {
    updateSetting('disableEnterSubmit', e.target.checked);
  });
  
  document.getElementById('language').addEventListener('change', (e) => {
    updateSetting('language', e.target.value);
  });
  
  widthSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    widthValue.textContent = value + 'px';
  });
  
  widthSlider.addEventListener('change', (e) => {
    const value = parseInt(e.target.value);
    updateSetting('customWidth', value);
  });
  
  // Action buttons
  document.getElementById('manage-prompts').addEventListener('click', async () => {
    try {
      // Find the best Gemini tab to use
      const geminiTab = await findBestGeminiTab();
      
      if (geminiTab) {
        try {
          // Send message to content script to show prompt manager overlay
          const response = await chrome.tabs.sendMessage(geminiTab.id, {
            action: 'togglePromptManager'
          });
          
          if (response && response.success) {
            // Focus the Gemini window and tab
            await chrome.windows.update(geminiTab.windowId, { focused: true });
            await chrome.tabs.update(geminiTab.id, { active: true });
          } else {
            console.warn('Content script failed to toggle prompt manager, falling back to new tab');
            chrome.tabs.create({ url: chrome.runtime.getURL('prompts.html') });
          }
        } catch (messageError) {
          console.warn('Failed to send message to content script, falling back to new tab:', messageError);
          chrome.tabs.create({ url: chrome.runtime.getURL('prompts.html') });
        }
      } else {
        // Fallback: create new tab with prompts page if no Gemini tab found
        chrome.tabs.create({ url: chrome.runtime.getURL('prompts.html') });
      }
    } catch (error) {
      console.error('Error opening prompts:', error);
      // Fallback to creating in current window
      chrome.tabs.create({ url: chrome.runtime.getURL('prompts.html') });
    }
  });
  
  document.getElementById('export-all').addEventListener('click', exportAllConversations);
  document.getElementById('backup-data').addEventListener('click', backupData);
  document.getElementById('restore-data').addEventListener('click', restoreData);
  document.getElementById('export-persistent').addEventListener('click', exportPersistentData);
  document.getElementById('import-persistent').addEventListener('click', importPersistentData);
  
  // Footer links
  document.getElementById('about-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://github.com/yourusername/superpower-gemini' });
  });
  
  document.getElementById('help-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('help.html') });
  });
  
  document.getElementById('privacy-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('privacy.html') });
  });
});

async function updateSetting(key, value) {
  const settings = await chrome.storage.sync.get('settings');
  const currentSettings = settings.settings || {};
  currentSettings[key] = value;
  await chrome.storage.sync.set({ settings: currentSettings });
  
  // Notify content script
  const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*' });
  tabs.forEach(tab => {
    chrome.tabs.sendMessage(tab.id, {
      action: 'settingsUpdated',
      settings: currentSettings
    });
  });
}

async function loadStatistics() {
  const data = await chrome.storage.local.get(['conversations', 'folders', 'promptHistory']);
  
  const conversationCount = data.conversations ? Object.keys(data.conversations).length : 0;
  const folderCount = data.folders ? Object.keys(data.folders).length : 0;
  const promptCount = data.promptHistory ? data.promptHistory.length : 0;
  
  document.getElementById('total-convs').textContent = conversationCount;
  document.getElementById('total-folders').textContent = folderCount;
  document.getElementById('total-prompts').textContent = promptCount;
}

async function exportAllConversations() {
  try {
    const data = await chrome.storage.local.get(['conversations', 'folders']);
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      conversations: data.conversations || {},
      folders: data.folders || {}
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    await chrome.downloads.download({
      url: url,
      filename: `gemini-conversations-${Date.now()}.json`,
      saveAs: true
    });
    
    // Keep focus on Gemini window after download
    const geminiTab = await findBestGeminiTab();
    if (geminiTab) {
      await chrome.windows.update(geminiTab.windowId, { focused: true });
    }
  } catch (error) {
    console.error('Export failed:', error);
    alert('Export failed: ' + error.message);
  }
}

async function backupData() {
  try {
    const data = await chrome.storage.local.get();
    const syncData = await chrome.storage.sync.get();
    
    const backup = {
      version: '1.0',
      backupDate: new Date().toISOString(),
      local: data,
      sync: syncData
    };
    
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    await chrome.downloads.download({
      url: url,
      filename: `gemini-superpower-backup-${Date.now()}.json`,
      saveAs: true
    });
    
    // Keep focus on Gemini window after download
    const geminiTab = await findBestGeminiTab();
    if (geminiTab) {
      await chrome.windows.update(geminiTab.windowId, { focused: true });
    }
  } catch (error) {
    console.error('Backup failed:', error);
    alert('Backup failed: ' + error.message);
  }
}

async function restoreData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      
      if (backup.version !== '1.0') {
        alert('Invalid backup file version');
        return;
      }
      
      if (confirm('This will replace all current data. Continue?')) {
        if (backup.local) {
          await chrome.storage.local.set(backup.local);
        }
        if (backup.sync) {
          await chrome.storage.sync.set(backup.sync);
        }
        
        alert('Data restored successfully!');
        
        // Focus Gemini window before closing popup
        const geminiTab = await findBestGeminiTab();
        if (geminiTab) {
          await chrome.windows.update(geminiTab.windowId, { focused: true });
        }
        
        window.close();
      }
    } catch (error) {
      alert('Error restoring data: ' + error.message);
    }
  });
  
  input.click();
}

async function exportPersistentData() {
  try {
    const persistentStorage = new PersistentStorage();
    await persistentStorage.exportData();
    
    // Keep focus on Gemini window after download
    const geminiTab = await findBestGeminiTab();
    if (geminiTab) {
      await chrome.windows.update(geminiTab.windowId, { focused: true });
    }
  } catch (error) {
    alert('Export failed: ' + error.message);
  }
}

async function importPersistentData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const persistentStorage = new PersistentStorage();
      const data = await persistentStorage.importData(file);
      
      alert('Data imported successfully!\n\nPlease refresh any open Gemini tabs to see the changes.');
      
      // Focus Gemini window before closing popup
      const geminiTab = await findBestGeminiTab();
      if (geminiTab) {
        await chrome.windows.update(geminiTab.windowId, { focused: true });
      }
      
      window.close();
    } catch (error) {
      alert('Import failed: ' + error.message);
    }
  });
  
  input.click();
}