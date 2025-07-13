// Superpower for Gemini - Content Script

class GeminiSuperpower {
  constructor() {
    this.conversations = new Map();
    this.folders = new Map();
    this.prompts = [];
    this.promptHistory = [];
    this.promptHistoryIndex = -1;
    this.settings = {
      autoSplit: false,
      customWidth: null,
      language: 'en',
      tone: 'default',
      disableEnterSubmit: false
    };
    this.persistentStorage = new PersistentStorage();
    this.init();
  }

  async init() {
    await this.loadFromPersistentStorage();
    await this.loadSettings();
    await this.loadConversations();
    await this.loadPrompts();
    await this.loadPromptHistory();
    this.injectScript();
    this.injectUI();
    this.attachEventListeners();
    this.observeDOM();
    this.setupMessageHandlers();
  }

  injectScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  async loadSettings() {
    const result = await chrome.storage.sync.get('settings');
    if (result.settings) {
      this.settings = { ...this.settings, ...result.settings };
    }
  }

  async loadConversations() {
    const result = await chrome.storage.local.get(['conversations', 'folders']);
    if (result.conversations) {
      this.conversations = new Map(Object.entries(result.conversations));
    }
    if (result.folders) {
      this.folders = new Map(Object.entries(result.folders));
    }
  }

  async loadPrompts() {
    const result = await chrome.storage.local.get('prompts');
    if (result.prompts) {
      this.prompts = result.prompts;
    }
  }

  async loadPromptHistory() {
    const result = await chrome.storage.local.get('promptHistory');
    if (result.promptHistory) {
      this.promptHistory = result.promptHistory;
    } else {
      this.promptHistory = [];
    }
  }

  async loadFromPersistentStorage() {
    try {
      const persistentData = await this.persistentStorage.loadData();
      if (persistentData) {
        console.log('Loading data from persistent storage');
        
        if (persistentData.conversations) {
          this.conversations = new Map(Object.entries(persistentData.conversations));
        }
        if (persistentData.folders) {
          this.folders = new Map(Object.entries(persistentData.folders));
        }
        if (persistentData.prompts) {
          this.prompts = persistentData.prompts;
        }
        if (persistentData.promptHistory) {
          this.promptHistory = persistentData.promptHistory;
        }
        if (persistentData.settings) {
          this.settings = { ...this.settings, ...persistentData.settings };
        }
        
        // Also update chrome storage with persistent data
        await this.saveToChromeStorage();
      }
    } catch (error) {
      console.warn('Could not load from persistent storage:', error);
    }
  }

  async saveToPersistentStorage() {
    try {
      const data = {
        conversations: Object.fromEntries(this.conversations),
        folders: Object.fromEntries(this.folders),
        prompts: this.prompts,
        promptHistory: this.promptHistory,
        settings: this.settings,
        lastSaved: Date.now()
      };
      
      await this.persistentStorage.saveData(data);
    } catch (error) {
      console.warn('Could not save to persistent storage:', error);
    }
  }

  async saveToChromeStorage() {
    try {
      await chrome.storage.local.set({
        conversations: Object.fromEntries(this.conversations),
        folders: Object.fromEntries(this.folders),
        prompts: this.prompts,
        promptHistory: this.promptHistory
      });
      
      await chrome.storage.sync.set({
        settings: this.settings
      });
    } catch (error) {
      console.warn('Could not save to chrome storage:', error);
    }
  }

  injectUI() {
    // Create sidebar for folders
    const sidebar = document.createElement('div');
    sidebar.id = 'gemini-superpower-sidebar';
    sidebar.innerHTML = `
      <div class="sp-sidebar-header">
        <h3>Conversations</h3>
        <button id="sp-new-folder" title="New Folder">📁+</button>
      </div>
      <div class="sp-search-box">
        <input type="text" id="sp-search" placeholder="Search conversations..." />
      </div>
      <div id="sp-folders-container"></div>
      <div id="sp-conversations-list"></div>
    `;
    document.body.appendChild(sidebar);

    // Create prompt manager
    const promptManager = document.createElement('div');
    promptManager.id = 'gemini-superpower-prompts';
    promptManager.style.display = 'none';
    promptManager.innerHTML = `
      <div class="sp-prompts-header">
        <h3>Prompt Library</h3>
        <button id="sp-close-prompts">✖</button>
      </div>
      <div class="sp-prompts-list"></div>
    `;
    document.body.appendChild(promptManager);

    // Add floating action buttons
    const fab = document.createElement('div');
    fab.id = 'gemini-superpower-fab';
    fab.innerHTML = `
      <button id="sp-toggle-sidebar" title="Toggle Sidebar">📊</button>
      <button id="sp-export-chat" title="Export Chat">💾</button>
      <button id="sp-prompts-btn" title="Prompts">💬</button>
    `;
    document.body.appendChild(fab);

    this.updateFoldersUI();
    this.updateConversationsUI();
  }

  attachEventListeners() {
    // Sidebar toggle
    document.getElementById('sp-toggle-sidebar').addEventListener('click', () => {
      const sidebar = document.getElementById('gemini-superpower-sidebar');
      sidebar.classList.toggle('sp-sidebar-visible');
    });

    // New folder
    document.getElementById('sp-new-folder').addEventListener('click', () => {
      const name = prompt('Enter folder name:');
      if (name) {
        this.createFolder(name);
      }
    });

    // Search
    document.getElementById('sp-search').addEventListener('input', (e) => {
      this.searchConversations(e.target.value);
    });

    // Export
    document.getElementById('sp-export-chat').addEventListener('click', () => {
      this.exportCurrentChat();
    });

    // Prompts
    document.getElementById('sp-prompts-btn').addEventListener('click', () => {
      const promptManager = document.getElementById('gemini-superpower-prompts');
      promptManager.style.display = promptManager.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('sp-close-prompts').addEventListener('click', () => {
      document.getElementById('gemini-superpower-prompts').style.display = 'none';
    });

    // Intercept Enter key if disabled
    if (this.settings.disableEnterSubmit) {
      this.interceptEnterKey();
    }
  }

  observeDOM() {
    const observer = new MutationObserver((mutations) => {
      // Detect new conversations
      this.detectNewConversation();
      
      // Add timestamps to messages
      this.addTimestamps();
      
      // Apply custom width if set
      if (this.settings.customWidth) {
        this.applyCustomWidth();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  detectNewConversation() {
    // Look for Gemini's conversation container
    const conversationElement = document.querySelector('[data-conversation-id], .conversation-container');
    if (conversationElement) {
      const conversationId = this.getConversationId();
      if (conversationId && !this.conversations.has(conversationId)) {
        this.saveConversation(conversationId);
      }
    }
  }

  getConversationId() {
    // Extract conversation ID from URL or DOM
    const urlMatch = window.location.pathname.match(/\/chat\/([^\/]+)/);
    if (urlMatch) return urlMatch[1];
    
    // Fallback: generate from timestamp
    return `gemini-${Date.now()}`;
  }

  saveConversation(id) {
    const title = this.getConversationTitle();
    const conversation = {
      id,
      title,
      timestamp: Date.now(),
      folderId: null,
      pinned: false,
      notes: ''
    };
    
    this.conversations.set(id, conversation);
    this.saveToStorage();
    this.updateConversationsUI();
  }

  getConversationTitle() {
    // Try to extract title from first message or generate one
    const firstMessage = document.querySelector('.message-content, .user-message');
    if (firstMessage) {
      return firstMessage.textContent.slice(0, 50) + '...';
    }
    return `Conversation ${new Date().toLocaleString()}`;
  }

  createFolder(name) {
    const folder = {
      id: `folder-${Date.now()}`,
      name,
      color: '#' + Math.floor(Math.random()*16777215).toString(16),
      conversations: []
    };
    
    this.folders.set(folder.id, folder);
    this.saveToStorage();
    this.updateFoldersUI();
  }

  updateFoldersUI() {
    const container = document.getElementById('sp-folders-container');
    container.innerHTML = Array.from(this.folders.values()).map(folder => `
      <div class="sp-folder" data-folder-id="${folder.id}" style="border-left: 3px solid ${folder.color}">
        <span class="sp-folder-name">${folder.name}</span>
        <span class="sp-folder-count">${folder.conversations.length}</span>
      </div>
    `).join('');
  }

  updateConversationsUI() {
    const container = document.getElementById('sp-conversations-list');
    const conversations = Array.from(this.conversations.values())
      .sort((a, b) => b.timestamp - a.timestamp);
    
    container.innerHTML = conversations.map(conv => `
      <div class="sp-conversation" data-id="${conv.id}">
        ${conv.pinned ? '<span class="sp-pin">📌</span>' : ''}
        <div class="sp-conv-title">${conv.title}</div>
        <div class="sp-conv-time">${new Date(conv.timestamp).toLocaleString()}</div>
      </div>
    `).join('');
  }

  searchConversations(query) {
    const conversations = Array.from(this.conversations.values());
    const filtered = conversations.filter(conv => 
      conv.title.toLowerCase().includes(query.toLowerCase())
    );
    
    const container = document.getElementById('sp-conversations-list');
    container.innerHTML = filtered.map(conv => `
      <div class="sp-conversation" data-id="${conv.id}">
        <div class="sp-conv-title">${this.highlightText(conv.title, query)}</div>
        <div class="sp-conv-time">${new Date(conv.timestamp).toLocaleString()}</div>
      </div>
    `).join('');
  }

  highlightText(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  addTimestamps() {
    const messages = document.querySelectorAll('.message-container:not(.sp-timestamped)');
    messages.forEach(msg => {
      const timestamp = document.createElement('div');
      timestamp.className = 'sp-timestamp';
      timestamp.textContent = new Date().toLocaleTimeString();
      msg.appendChild(timestamp);
      msg.classList.add('sp-timestamped');
    });
  }

  applyCustomWidth() {
    const conversationContainer = document.querySelector('.conversation-main, main');
    if (conversationContainer) {
      conversationContainer.style.maxWidth = this.settings.customWidth + 'px';
    }
  }

  interceptEnterKey() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        const inputField = document.querySelector('textarea, [contenteditable="true"]');
        if (inputField && document.activeElement === inputField) {
          e.preventDefault();
        }
      }
    });
  }

  async exportCurrentChat() {
    const messages = this.collectMessages();
    const format = await this.selectExportFormat();
    
    switch(format) {
      case 'json':
        this.downloadJSON(messages);
        break;
      case 'md':
        this.downloadMarkdown(messages);
        break;
      case 'txt':
        this.downloadText(messages);
        break;
      case 'pdf':
        this.downloadPDF(messages);
        break;
    }
  }

  collectMessages() {
    const messages = [];
    const messageElements = document.querySelectorAll('.message-container, .conversation-turn');
    
    messageElements.forEach(elem => {
      const role = elem.querySelector('.model-message') ? 'assistant' : 'user';
      const content = elem.querySelector('.message-content, .text-content')?.textContent || '';
      messages.push({ role, content, timestamp: Date.now() });
    });
    
    return messages;
  }

  async selectExportFormat() {
    return new Promise(resolve => {
      const formats = ['json', 'md', 'txt', 'pdf'];
      const selected = prompt('Select format: json, md, txt, or pdf', 'md');
      resolve(formats.includes(selected) ? selected : 'md');
    });
  }

  downloadJSON(messages) {
    const data = JSON.stringify(messages, null, 2);
    this.download('conversation.json', data, 'application/json');
  }

  downloadMarkdown(messages) {
    const content = messages.map(msg => 
      `## ${msg.role === 'user' ? 'You' : 'Gemini'}\n\n${msg.content}\n\n---\n`
    ).join('\n');
    this.download('conversation.md', content, 'text/markdown');
  }

  downloadText(messages) {
    const content = messages.map(msg => 
      `${msg.role === 'user' ? 'You' : 'Gemini'}: ${msg.content}\n\n`
    ).join('');
    this.download('conversation.txt', content, 'text/plain');
  }

  downloadPDF(messages) {
    // For PDF, we'll need to send to background script
    chrome.runtime.sendMessage({
      action: 'generatePDF',
      messages: messages
    });
  }

  download(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async saveToStorage() {
    await this.saveToChromeStorage();
    await this.saveToPersistentStorage();
  }
  setupMessageHandlers() {
    // Handle messages from injected script
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      
      switch (event.data.type) {
        case 'GEMINI_CONVERSATION_UPDATE':
          this.handleConversationUpdate(event.data.data);
          break;
          
        case 'GEMINI_PROMPT_SENT':
          this.savePromptToHistory(event.data.data);
          break;
          
        case 'GET_PROMPTS_FOR_AUTOCOMPLETE':
          this.sendPromptsForAutocomplete();
          break;
          
        case 'NAVIGATE_PROMPT_HISTORY':
          this.navigatePromptHistory(event.data.direction);
          break;
      }
    });
    
    // Handle messages from popup/background
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('Content script received message:', request);
      switch (request.action) {
        case 'ping':
          sendResponse({ success: true, message: 'Content script is loaded' });
          break;
          
        case 'settingsUpdated':
          this.settings = request.settings;
          this.applySettings();
          sendResponse({ success: true });
          break;
          
        case 'insertScreenshot':
          this.insertScreenshot(request.screenshot);
          sendResponse({ success: true });
          break;
          
        case 'insertPrompt':
          console.log('Inserting prompt:', request.prompt);
          this.insertPrompt(request.prompt);
          sendResponse({ success: true });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
      return true; // Keep message channel open for async response
    });
  }
  
  handleConversationUpdate(data) {
    // Update conversation data based on API responses
    const conversationId = this.getConversationId();
    if (conversationId && this.conversations.has(conversationId)) {
      const conversation = this.conversations.get(conversationId);
      conversation.lastUpdate = Date.now();
      this.saveToStorage();
    }
  }
  
  async savePromptToHistory(data) {
    // Add to local history
    this.promptHistory.unshift(data);
    if (this.promptHistory.length > 100) {
      this.promptHistory = this.promptHistory.slice(0, 100);
    }
    
    // Save to both chrome storage and persistent storage
    await this.saveToChromeStorage();
    await this.saveToPersistentStorage();
    
    // Also save via background script for additional persistence
    try {
      chrome.runtime.sendMessage({
        action: 'savePromptHistory',
        prompt: data.prompt
      });
    } catch (error) {
      console.warn('Could not send to background:', error);
    }
  }
  
  sendPromptsForAutocomplete() {
    window.postMessage({
      type: 'PROMPTS_FOR_AUTOCOMPLETE',
      prompts: this.prompts.slice(0, 10)
    }, '*');
  }
  
  navigatePromptHistory(direction) {
    if (this.promptHistory.length === 0) return;
    
    if (direction === 'up') {
      this.promptHistoryIndex = Math.min(this.promptHistoryIndex + 1, this.promptHistory.length - 1);
    } else {
      this.promptHistoryIndex = Math.max(this.promptHistoryIndex - 1, -1);
    }
    
    if (this.promptHistoryIndex >= 0 && this.promptHistoryIndex < this.promptHistory.length) {
      window.postMessage({
        type: 'INSERT_PROMPT_FROM_HISTORY',
        prompt: this.promptHistory[this.promptHistoryIndex].prompt
      }, '*');
    }
  }
  
  applySettings() {
    if (this.settings.customWidth) {
      this.applyCustomWidth();
    }
    
    if (this.settings.disableEnterSubmit) {
      this.interceptEnterKey();
    }
  }
  
  insertScreenshot(screenshot) {
    // Find input field and insert screenshot
    const inputField = document.querySelector('textarea, [contenteditable="true"]');
    if (inputField) {
      // For Gemini, we'll need to trigger the image upload flow
      // This is a simplified version - real implementation would need to handle Gemini's specific upload mechanism
      console.log('Screenshot insertion requested');
    }
  }
  
  insertPrompt(prompt) {
    // Try injected script approach first
    window.postMessage({
      type: 'INSERT_PROMPT_FROM_HISTORY',
      prompt: prompt
    }, '*');
    
    // Fallback: try direct insertion after a short delay
    setTimeout(() => {
      const inputField = document.querySelector('textarea, [contenteditable="true"]');
      if (inputField) {
        console.log('Found input field, inserting prompt directly:', inputField);
        if (inputField.tagName === 'TEXTAREA') {
          inputField.value = prompt;
        } else {
          inputField.textContent = prompt;
          // For contenteditable, also try innerHTML
          if (!inputField.textContent) {
            inputField.innerHTML = prompt;
          }
        }
        
        // Trigger multiple events to ensure Gemini detects the change
        ['input', 'change', 'keyup'].forEach(eventType => {
          const event = new Event(eventType, { bubbles: true });
          inputField.dispatchEvent(event);
        });
        
        // Focus and move cursor to end
        inputField.focus();
        if (inputField.tagName === 'TEXTAREA') {
          inputField.setSelectionRange(inputField.value.length, inputField.value.length);
        } else {
          // For contenteditable, move cursor to end
          const range = document.createRange();
          const selection = window.getSelection();
          range.selectNodeContents(inputField);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      } else {
        console.warn('No input field found for prompt insertion');
      }
    }, 100);
  }
}

// Initialize extension
const geminiSuperpower = new GeminiSuperpower();