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

  async updatePromptsUI() {
    // Default to showing My Prompts tab
    await this.updateMyPromptsUI();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  usePrompt(promptId) {
    const prompt = this.prompts.find(p => p.id === promptId);
    if (prompt) {
      this.insertPrompt(prompt.template);
      // Hide the prompt manager after using a prompt
      const promptManager = document.getElementById('gemini-superpower-prompts');
      if (promptManager) {
        promptManager.style.display = 'none';
      }
    }
  }

  editPrompt(promptId) {
    // For now, just open the full prompts manager
    window.open(chrome.runtime.getURL('prompts.html'), '_blank');
  }

  switchTab(tabName) {
    // Remove active class from all tabs and content
    document.querySelectorAll('.sp-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.sp-tab-content').forEach(content => content.classList.remove('active'));
    
    // Add active class to clicked tab
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Show corresponding content
    const contentId = `sp-${tabName.replace('-', '-')}`;
    document.getElementById(contentId).classList.add('active');
    
    // Load content for the selected tab
    this.loadTabContent(tabName);
  }

  async loadTabContent(tabName) {
    switch(tabName) {
      case 'my-prompts':
        await this.updateMyPromptsUI();
        break;
      case 'public-prompts':
        this.updatePublicPromptsUI();
        break;
      case 'prompt-chains':
        this.updatePromptChainsUI();
        break;
      case 'history':
        this.updateHistoryUI();
        break;
    }
  }

  async updateMyPromptsUI() {
    const promptsList = document.querySelector('.sp-prompts-list');
    if (!promptsList) return;

    // Ensure prompts are loaded before displaying
    if (this.prompts.length === 0) {
      await this.loadPrompts();
    }

    console.log('Updating My Prompts UI with', this.prompts.length, 'prompts:', this.prompts);

    if (this.prompts.length === 0) {
      promptsList.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No prompts available</p>';
      return;
    }

    promptsList.innerHTML = this.prompts.map(prompt => `
      <div class="sp-prompt-item" data-id="${prompt.id}">
        <div class="sp-prompt-checkbox">
          <input type="checkbox" class="sp-prompt-select" data-id="${prompt.id}">
        </div>
        <div class="sp-prompt-content">
          <div class="sp-prompt-header">
            <h4>${this.escapeHtml(prompt.name)}</h4>
            <span class="sp-prompt-category">${prompt.category}</span>
          </div>
          <div class="sp-prompt-template">${this.escapeHtml(prompt.template)}</div>
          <div class="sp-prompt-actions">
            <button class="sp-prompt-use" data-action="use-prompt" data-id="${prompt.id}">Use</button>
            <button class="sp-prompt-edit" data-action="edit-prompt" data-id="${prompt.id}">Edit</button>
            <button class="sp-prompt-delete" data-action="delete-prompt" data-id="${prompt.id}">Delete</button>
          </div>
        </div>
      </div>
    `).join('');

    // Add event listeners for prompt actions using arrow functions to maintain this context
    promptsList.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      const promptId = e.target.dataset.id;
      
      if (action === 'use-prompt') {
        this.usePrompt(promptId);
      } else if (action === 'edit-prompt') {
        this.editPrompt(promptId);
      } else if (action === 'delete-prompt') {
        this.deletePrompt(promptId);
      }
    });

    // Add event listeners for checkboxes
    promptsList.addEventListener('change', (e) => {
      if (e.target.classList.contains('sp-prompt-select')) {
        this.updateSelectionButtons();
      }
    });

    // Ensure action button event listeners are attached
    this.attachPromptActionListeners();
  }

  updatePublicPromptsUI() {
    const publicList = document.querySelector('.sp-public-list');
    if (!publicList) return;

    // Sample public prompts
    const samplePublicPrompts = [
      { id: 'pub1', name: 'Code Review Assistant', category: 'technical', template: 'Review this code and suggest improvements: {{code}}', author: 'Community', upvotes: 42 },
      { id: 'pub2', name: 'Explain Like I\'m Five', category: 'learning', template: 'Explain {{concept}} in simple terms that a 5-year-old would understand', author: 'Community', upvotes: 38 },
      { id: 'pub3', name: 'Language Translator', category: 'language', template: 'Translate the following text from {{source_language}} to {{target_language}}: {{text}}', author: 'Community', upvotes: 31 }
    ];

    publicList.innerHTML = samplePublicPrompts.map(prompt => `
      <div class="sp-prompt-item" data-id="${prompt.id}">
        <div class="sp-prompt-header">
          <h4>${this.escapeHtml(prompt.name)}</h4>
          <span class="sp-prompt-category">${prompt.category}</span>
        </div>
        <div class="sp-prompt-template">${this.escapeHtml(prompt.template)}</div>
        <div class="sp-prompt-meta">
          <span>by ${prompt.author} • ❤️ ${prompt.upvotes}</span>
        </div>
        <div class="sp-prompt-actions">
          <button class="sp-prompt-use" data-action="use-public-prompt" data-id="${prompt.id}">Use</button>
          <button class="sp-prompt-import" data-action="import-prompt" data-id="${prompt.id}">Import</button>
        </div>
      </div>
    `).join('');
  }

  updatePromptChainsUI() {
    const chainsList = document.querySelector('.sp-chains-list');
    if (!chainsList) return;

    chainsList.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Prompt Chains feature coming soon!</p>';
  }

  updateHistoryUI() {
    const historyList = document.querySelector('.sp-history-list');
    if (!historyList) return;

    if (this.promptHistory.length === 0) {
      historyList.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No prompt history available</p>';
      return;
    }

    historyList.innerHTML = this.promptHistory.slice(0, 10).map((prompt, index) => `
      <div class="sp-history-item">
        <div class="sp-history-text">${this.escapeHtml(prompt.substring(0, 100))}${prompt.length > 100 ? '...' : ''}</div>
        <div class="sp-history-actions">
          <button class="sp-prompt-use" onclick="this.insertPrompt('${this.escapeHtml(prompt)}')">Use Again</button>
        </div>
      </div>
    `).join('');
  }

  showNewPromptModal() {
    const modal = document.createElement('div');
    modal.className = 'sp-modal';
    modal.innerHTML = `
      <div class="sp-modal-content">
        <div class="sp-modal-header">
          <h3>New Prompt</h3>
          <button class="sp-modal-close">✖</button>
        </div>
        <div class="sp-modal-body">
          <div class="sp-form-group">
            <label>Prompt Name:</label>
            <input type="text" id="sp-prompt-name" placeholder="Enter prompt name">
          </div>
          <div class="sp-form-group">
            <label>Category:</label>
            <select id="sp-prompt-category">
              <option value="utility">Utility</option>
              <option value="learning">Learning</option>
              <option value="technical">Technical</option>
              <option value="creative">Creative</option>
              <option value="writing">Writing</option>
            </select>
          </div>
          <div class="sp-form-group">
            <label>Prompt Template:</label>
            <textarea id="sp-prompt-template" placeholder="Enter your prompt template. Use {{variable}} for dynamic parts."></textarea>
          </div>
        </div>
        <div class="sp-modal-footer">
          <button class="sp-btn-secondary" id="sp-cancel-prompt">Cancel</button>
          <button class="sp-btn-primary" id="sp-create-prompt">Create Prompt</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event listeners
    modal.querySelector('.sp-modal-close').addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    modal.querySelector('#sp-cancel-prompt').addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    modal.querySelector('#sp-create-prompt').addEventListener('click', () => {
      this.createNewPrompt(modal);
    });
    
    // Close on outside click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
  }

  async createNewPrompt(modal) {
    const name = modal.querySelector('#sp-prompt-name').value.trim();
    const category = modal.querySelector('#sp-prompt-category').value;
    const template = modal.querySelector('#sp-prompt-template').value.trim();
    
    if (!name || !template) {
      alert('Please fill in both name and template fields.');
      return;
    }
    
    const newPrompt = {
      id: 'custom_' + Date.now(),
      name: name,
      category: category,
      template: template
    };
    
    this.prompts.push(newPrompt);
    await chrome.storage.local.set({ prompts: this.prompts });
    
    // Refresh the prompts UI
    await this.updateMyPromptsUI();
    
    // Close modal
    document.body.removeChild(modal);
    
    console.log('New prompt created:', newPrompt);
  }

  async saveCurrentPrompt() {
    // Get the current text from Gemini's input
    const inputElement = document.querySelector('rich-textarea div[contenteditable="true"]') || 
                        document.querySelector('textarea[placeholder*="message"]') ||
                        document.querySelector('[data-testid="textbox"]');
    
    if (!inputElement) {
      alert('Could not find the chat input. Please make sure you are on the Gemini chat page.');
      return;
    }
    
    const currentText = inputElement.textContent || inputElement.value || '';
    
    if (!currentText.trim()) {
      alert('No text found in the chat input to save as a prompt.');
      return;
    }
    
    // Create a prompt from current text
    const promptName = prompt('Enter a name for this prompt:');
    if (!promptName) return;
    
    const promptCategory = prompt('Enter a category (utility, learning, technical, creative, writing):') || 'utility';
    
    const newPrompt = {
      id: 'saved_' + Date.now(),
      name: promptName,
      category: promptCategory,
      template: currentText
    };
    
    this.prompts.push(newPrompt);
    await chrome.storage.local.set({ prompts: this.prompts });
    
    // Refresh the prompts UI
    await this.updateMyPromptsUI();
    
    alert('Prompt saved successfully!');
    console.log('Saved prompt:', newPrompt);
  }

  async importFromChat() {
    // Get the last conversation response from Gemini
    const responses = document.querySelectorAll('[data-testid="conversation-turn-content"]');
    
    if (responses.length === 0) {
      alert('No conversation found to import from.');
      return;
    }
    
    // Get the last response
    const lastResponse = responses[responses.length - 1];
    const responseText = lastResponse.textContent || '';
    
    if (!responseText.trim()) {
      alert('No text found in the last response.');
      return;
    }
    
    // Create a prompt from the response
    const promptName = prompt('Enter a name for this imported prompt:');
    if (!promptName) return;
    
    const promptCategory = prompt('Enter a category (utility, learning, technical, creative, writing):') || 'utility';
    
    const newPrompt = {
      id: 'imported_' + Date.now(),
      name: promptName,
      category: promptCategory,
      template: responseText
    };
    
    this.prompts.push(newPrompt);
    await chrome.storage.local.set({ prompts: this.prompts });
    
    // Refresh the prompts UI
    await this.updateMyPromptsUI();
    
    alert('Response imported as prompt successfully!');
    console.log('Imported prompt:', newPrompt);
  }

  async deletePrompt(promptId) {
    if (!confirm('Are you sure you want to delete this prompt?')) {
      return;
    }
    
    this.prompts = this.prompts.filter(p => p.id !== promptId);
    await chrome.storage.local.set({ prompts: this.prompts });
    await this.saveToPersistentStorage();
    
    // Refresh the prompts UI
    await this.updateMyPromptsUI();
    
    console.log('Deleted prompt:', promptId);
  }

  updateSelectionButtons() {
    const checkboxes = document.querySelectorAll('.sp-prompt-select');
    const checkedBoxes = document.querySelectorAll('.sp-prompt-select:checked');
    
    const importBtn = document.getElementById('sp-import-selected');
    const deleteBtn = document.getElementById('sp-delete-selected');
    const selectAllCheckbox = document.getElementById('sp-select-all');
    
    const hasSelection = checkedBoxes.length > 0;
    
    importBtn.disabled = !hasSelection;
    deleteBtn.disabled = !hasSelection;
    
    // Update select all checkbox state
    if (selectAllCheckbox) {
      if (checkedBoxes.length === 0) {
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.checked = false;
      } else if (checkedBoxes.length === checkboxes.length) {
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.checked = true;
      } else {
        selectAllCheckbox.indeterminate = true;
        selectAllCheckbox.checked = false;
      }
    }
    
    // Update button text with count
    if (hasSelection) {
      importBtn.textContent = `📤 Import Selected (${checkedBoxes.length}) to Chat`;
      deleteBtn.textContent = `🗑️ Delete Selected (${checkedBoxes.length})`;
    } else {
      importBtn.textContent = '📤 Import Selected to Chat';
      deleteBtn.textContent = '🗑️ Delete Selected';
    }
  }

  toggleSelectAll(checked) {
    const checkboxes = document.querySelectorAll('.sp-prompt-select');
    checkboxes.forEach(checkbox => {
      checkbox.checked = checked;
    });
    this.updateSelectionButtons();
  }

  attachPromptActionListeners() {
    // Remove existing listeners first to avoid duplicates
    const newPromptBtn = document.getElementById('sp-new-prompt');
    const savePromptBtn = document.getElementById('sp-save-prompt');
    const importChatBtn = document.getElementById('sp-import-chat');
    const importSelectedBtn = document.getElementById('sp-import-selected');
    const deleteSelectedBtn = document.getElementById('sp-delete-selected');
    const selectAllCheckbox = document.getElementById('sp-select-all');

    if (newPromptBtn) {
      newPromptBtn.removeEventListener('click', this.showNewPromptModal);
      newPromptBtn.addEventListener('click', this.showNewPromptModal.bind(this));
    }

    if (savePromptBtn) {
      savePromptBtn.removeEventListener('click', this.saveCurrentPrompt);
      savePromptBtn.addEventListener('click', this.saveCurrentPrompt.bind(this));
    }

    if (importChatBtn) {
      importChatBtn.removeEventListener('click', this.importFromChat);
      importChatBtn.addEventListener('click', this.importFromChat.bind(this));
    }

    if (importSelectedBtn) {
      importSelectedBtn.removeEventListener('click', this.importSelectedToChat);
      importSelectedBtn.addEventListener('click', this.importSelectedToChat.bind(this));
    }

    if (deleteSelectedBtn) {
      deleteSelectedBtn.removeEventListener('click', this.deleteSelectedPrompts);
      deleteSelectedBtn.addEventListener('click', this.deleteSelectedPrompts.bind(this));
    }

    if (selectAllCheckbox) {
      selectAllCheckbox.removeEventListener('change', this.toggleSelectAll);
      selectAllCheckbox.addEventListener('change', this.toggleSelectAll.bind(this));
    }
  }

  async importSelectedToChat() {
    const checkedBoxes = document.querySelectorAll('.sp-prompt-select:checked');
    
    if (checkedBoxes.length === 0) {
      alert('Please select at least one prompt to import.');
      return;
    }
    
    const selectedIds = Array.from(checkedBoxes).map(cb => cb.dataset.id);
    const selectedPrompts = this.prompts.filter(p => selectedIds.includes(p.id));
    
    if (selectedPrompts.length === 0) {
      alert('No valid prompts found for selection.');
      return;
    }
    
    // Combine selected prompts with separators
    const combinedText = selectedPrompts.map(prompt => 
      `[${prompt.name}]\n${prompt.template}`
    ).join('\n\n---\n\n');
    
    // Insert into chat
    this.insertPrompt(combinedText);
    
    // Hide the prompt manager after importing
    const promptManager = document.getElementById('gemini-superpower-prompts');
    if (promptManager) {
      promptManager.style.display = 'none';
    }
    
    console.log('Imported selected prompts:', selectedPrompts);
  }

  async deleteSelectedPrompts() {
    console.log('deleteSelectedPrompts called');
    const checkedBoxes = document.querySelectorAll('.sp-prompt-select:checked');
    console.log('Found checked boxes:', checkedBoxes.length, checkedBoxes);
    
    if (checkedBoxes.length === 0) {
      alert('Please select at least one prompt to delete.');
      return;
    }
    
    const count = checkedBoxes.length;
    console.log('About to confirm deletion of', count, 'prompts');
    if (!confirm(`Are you sure you want to delete ${count} selected prompt${count > 1 ? 's' : ''}?`)) {
      console.log('User cancelled deletion');
      return;
    }
    
    const selectedIds = Array.from(checkedBoxes).map(cb => cb.dataset.id);
    console.log('Selected IDs to delete:', selectedIds);
    console.log('Current prompts before deletion:', this.prompts);
    
    this.prompts = this.prompts.filter(p => !selectedIds.includes(p.id));
    console.log('Prompts after deletion:', this.prompts);
    
    await chrome.storage.local.set({ prompts: this.prompts });
    await this.saveToPersistentStorage();
    console.log('Saved to storage');
    
    // Refresh the prompts UI
    await this.updateMyPromptsUI();
    console.log('UI refreshed');
    
    console.log('Deleted selected prompts:', selectedIds);
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
    console.log('Loading prompts from storage...');
    const result = await chrome.storage.local.get('prompts');
    console.log('Storage result:', result);
    
    if (result.prompts && result.prompts.length > 0) {
      this.prompts = result.prompts;
      console.log('Loaded existing prompts:', this.prompts);
    } else {
      console.log('No existing prompts found, creating defaults...');
      // Initialize with some default prompts if none exist
      this.prompts = [
        {
          id: 'default1',
          name: 'Explain Simply',
          category: 'learning',
          template: 'Explain {{topic}} in simple terms that are easy to understand'
        },
        {
          id: 'default2', 
          name: 'Code Review',
          category: 'technical',
          template: 'Review this code and suggest improvements:\n\n{{code}}'
        },
        {
          id: 'default3',
          name: 'Writing Assistant',
          category: 'writing',
          template: 'Help me improve this text: {{text}}'
        }
      ];
      // Save default prompts
      await chrome.storage.local.set({ prompts: this.prompts });
      await this.saveToPersistentStorage();
      console.log('Created and saved default prompts:', this.prompts);
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
      <div class="sp-prompts-tabs">
        <button class="sp-tab active" data-tab="my-prompts">My Prompts</button>
        <button class="sp-tab" data-tab="public-prompts">Public Prompts</button>
        <button class="sp-tab" data-tab="prompt-chains">Prompt Chains</button>
        <button class="sp-tab" data-tab="history">Prompt History</button>
      </div>
      <div class="sp-tab-content active" id="sp-my-prompts">
        <div class="sp-prompts-actions">
          <div class="sp-actions-left">
            <button class="sp-action-btn" id="sp-new-prompt">+ New Prompt</button>
            <button class="sp-action-btn" id="sp-save-prompt">💾 Save Prompt</button>
            <button class="sp-action-btn" id="sp-import-chat">📥 Import from Chat</button>
          </div>
          <div class="sp-actions-right">
            <label class="sp-select-all-label">
              <input type="checkbox" id="sp-select-all" class="sp-select-all-checkbox">
              <span>Select All</span>
            </label>
            <button class="sp-action-btn" id="sp-import-selected" disabled>📤 Import Selected to Chat</button>
            <button class="sp-action-btn" id="sp-delete-selected" disabled>🗑️ Delete Selected</button>
          </div>
        </div>
        <div class="sp-prompts-list"></div>
      </div>
      <div class="sp-tab-content" id="sp-public-prompts">
        <div class="sp-public-list"></div>
      </div>
      <div class="sp-tab-content" id="sp-prompt-chains">
        <div class="sp-chains-list"></div>
      </div>
      <div class="sp-tab-content" id="sp-history">
        <div class="sp-history-list"></div>
      </div>
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

    // Add tab switching functionality
    document.querySelectorAll('.sp-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const targetTab = e.target.dataset.tab;
        this.switchTab(targetTab);
      });
    });

    // Prompt action button listeners are now handled in attachPromptActionListeners()

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
    chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
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
          
        case 'togglePromptManager':
          console.log('Attempting to toggle prompt manager...');
          const promptManager = document.getElementById('gemini-superpower-prompts');
          console.log('Prompt manager element:', promptManager);
          if (promptManager) {
            const currentDisplay = promptManager.style.display;
            const newDisplay = currentDisplay === 'none' ? 'block' : 'none';
            promptManager.style.display = newDisplay;
            
            // Update prompts UI when showing the manager
            if (newDisplay === 'block') {
              await this.updatePromptsUI();
            }
            
            console.log('Toggled prompt manager display from', currentDisplay, 'to', newDisplay);
            sendResponse({ success: true, message: 'Prompt manager toggled successfully' });
          } else {
            console.error('Prompt manager element not found in DOM');
            // Try to re-inject the UI if element is missing
            this.injectUI();
            const retryManager = document.getElementById('gemini-superpower-prompts');
            if (retryManager) {
              retryManager.style.display = 'block';
              await this.updatePromptsUI();
              sendResponse({ success: true, message: 'Prompt manager re-injected and shown' });
            } else {
              sendResponse({ success: false, error: 'Prompt manager not found and re-injection failed' });
            }
          }
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