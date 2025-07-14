// Prompts Manager JavaScript

let prompts = [];
let publicPrompts = [];
let promptChains = [];
let promptHistory = [];
let currentEditingPrompt = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadAllData();
  setupEventListeners();
  renderMyPrompts();
});

async function loadAllData() {
  try {
    // First try to load from persistent storage
    const persistentStorage = new PersistentStorage();
    const persistentData = await persistentStorage.loadData();
    
    if (persistentData) {
      console.log('Loading prompts data from persistent storage');
      prompts = persistentData.prompts || [];
      promptHistory = persistentData.promptHistory || [];
      promptChains = persistentData.promptChains || [];
    }
    
    // Also load from chrome storage (fallback and current data)
    const data = await chrome.storage.local.get(['prompts', 'publicPrompts', 'promptChains', 'promptHistory']);
    
    // Merge with chrome storage data (chrome storage takes precedence for newer data)
    if (data.prompts && data.prompts.length > 0) {
      prompts = data.prompts;
    }
    if (data.promptHistory && data.promptHistory.length > 0) {
      promptHistory = data.promptHistory;
    }
    if (data.promptChains && data.promptChains.length > 0) {
      promptChains = data.promptChains;
    }
    
    publicPrompts = data.publicPrompts || [];
    
    console.log('Loaded data:', { 
      prompts: prompts.length, 
      promptHistory: promptHistory.length, 
      promptChains: promptChains.length 
    });
  } catch (error) {
    console.warn('Error loading data:', error);
    // Fallback to chrome storage only
    const data = await chrome.storage.local.get(['prompts', 'publicPrompts', 'promptChains', 'promptHistory']);
    prompts = data.prompts || [];
    publicPrompts = data.publicPrompts || [];
    promptChains = data.promptChains || [];
    promptHistory = data.promptHistory || [];
  }
}

function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      
      tab.classList.add('active');
      const tabId = tab.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
      
      // Render appropriate content
    
    switch(tabId) {
      case 'my-prompts':
        renderMyPrompts();
        break;
      case 'public-prompts':
        renderPublicPrompts();
        break;
      case 'prompt-chains':
        renderPromptChains();
        break;
      case 'history':
        renderHistory();
        break;
    }
    });
  });
  
  // Add prompt button
  document.getElementById('add-prompt').addEventListener('click', () => {
    currentEditingPrompt = null;
    showPromptModal();
  });
  
  // Modal events
  document.getElementById('cancel-prompt').addEventListener('click', hidePromptModal);
  document.getElementById('prompt-form').addEventListener('submit', savePrompt);
  
  // Chain modal events
  document.getElementById('cancel-chain').addEventListener('click', hideChainModal);
  document.getElementById('chain-form').addEventListener('submit', saveChain);
  document.getElementById('add-step-btn').addEventListener('click', addChainStep);
  
  // Search and filter
  document.getElementById('search-prompts').addEventListener('input', handleSearch);
  document.getElementById('filter-category').addEventListener('change', handleFilter);
  
  // Event delegation for import buttons and other actions
  document.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    const id = e.target.dataset.id;
    
    if (action) {
      console.log('Action clicked:', action, 'ID:', id);
    }
    
    switch (action) {
      case 'import':
        importToChat(id);
        break;
      case 'create-chain':
        console.log('Creating chain...');
        createPromptChain();
        break;
      case 'run-chain':
        runChain(id);
        break;
      case 'edit-chain':
        editChain(id);
        break;
      case 'duplicate-chain':
        duplicateChain(id);
        break;
      case 'delete-chain':
        deleteChain(id);
        break;
      case 'remove-step':
        removeChainStep(e.target);
        break;
    }
  });
  
  // Close modal on outside click
  document.getElementById('prompt-modal').addEventListener('click', (e) => {
    if (e.target.id === 'prompt-modal') {
      hidePromptModal();
    }
  });
  
  document.getElementById('chain-modal').addEventListener('click', (e) => {
    if (e.target.id === 'chain-modal') {
      hideChainModal();
    }
  });
}

function renderMyPrompts() {
  const container = document.getElementById('my-prompts-list');
  const searchTerm = document.getElementById('search-prompts').value.toLowerCase();
  const category = document.getElementById('filter-category').value;
  
  let filteredPrompts = prompts.filter(prompt => {
    const matchesSearch = prompt.name.toLowerCase().includes(searchTerm) || 
                         prompt.template.toLowerCase().includes(searchTerm);
    const matchesCategory = !category || prompt.category === category;
    return matchesSearch && matchesCategory;
  });
  
  container.innerHTML = filteredPrompts.map(prompt => `
    <div class="prompt-card" data-id="${prompt.id}">
      <h3>${escapeHtml(prompt.name)}</h3>
      <span class="category">${prompt.category}</span>
      <div class="template">${escapeHtml(prompt.template)}</div>
      <div class="actions">
        <button onclick="editPrompt('${prompt.id}')">Edit</button>
        <button onclick="duplicatePrompt('${prompt.id}')">Duplicate</button>
        <button data-action="import" data-id="${prompt.id}" class="import-btn">Import to Chat</button>
        <button onclick="deletePrompt('${prompt.id}')">Delete</button>
      </div>
    </div>
  `).join('');
  
  if (filteredPrompts.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #999; grid-column: 1/-1;">No prompts found</p>';
  }
}

function renderPublicPrompts() {
  const container = document.getElementById('public-prompts-list');
  
  // Simulate public prompts
  const samplePublicPrompts = [
    { id: 'pub1', name: 'Code Review Assistant', category: 'technical', template: 'Review this code and suggest improvements: {{code}}', author: 'Community', upvotes: 42 },
    { id: 'pub2', name: 'Explain Like I\'m Five', category: 'learning', template: 'Explain {{concept}} in simple terms that a 5-year-old would understand', author: 'Community', upvotes: 38 },
    { id: 'pub3', name: 'Language Translator', category: 'language', template: 'Translate the following text from {{source_language}} to {{target_language}}: {{text}}', author: 'Community', upvotes: 31 }
  ];
  
  container.innerHTML = samplePublicPrompts.map(prompt => `
    <div class="prompt-card">
      <h3>${escapeHtml(prompt.name)}</h3>
      <span class="category">${prompt.category}</span>
      <div class="template">${escapeHtml(prompt.template)}</div>
      <div style="margin-top: 8px; font-size: 12px; color: #666;">
        By ${prompt.author} • ⬆ ${prompt.upvotes}
      </div>
      <div class="actions">
        <button onclick="importPrompt('${prompt.id}')">Import</button>
        <button data-action="import" data-id="pub_${prompt.id}" class="import-btn">Import to Chat</button>
        <button onclick="previewPrompt('${prompt.id}')">Preview</button>
      </div>
    </div>
  `).join('');
}

function renderPromptChains() {
  const container = document.getElementById('chains-list');
  
  if (promptChains.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #999;">
        <p>No prompt chains created yet</p>
        <p style="margin: 16px 0; font-size: 14px;">Prompt chains let you run multiple prompts in sequence, with each step building on the previous response.</p>
        <button class="primary-btn" data-action="create-chain" style="margin-top: 16px;">Create Your First Chain</button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = promptChains.map(chain => `
    <div class="chain-item" id="chain-${chain.id}">
      <h3>${escapeHtml(chain.name)}</h3>
      <p style="color: #666; margin: 8px 0;">${escapeHtml(chain.description || 'No description')}</p>
      <div class="chain-steps">
        ${chain.steps.map((step, i) => `
          <div class="chain-step">${i + 1}. ${escapeHtml(step.name)}</div>
        `).join('')}
      </div>
      <div class="chain-progress" id="progress-${chain.id}">
        <div class="chain-progress-title">Execution Progress:</div>
        <div id="progress-steps-${chain.id}"></div>
      </div>
      <div class="actions" style="margin-top: 12px;">
        <button class="chain-run-btn" data-action="run-chain" data-id="${chain.id}">▶ Run Chain</button>
        <button data-action="edit-chain" data-id="${chain.id}">Edit</button>
        <button data-action="duplicate-chain" data-id="${chain.id}">Duplicate</button>
        <button data-action="delete-chain" data-id="${chain.id}">Delete</button>
      </div>
    </div>
  `).join('');
}

function renderHistory() {
  const container = document.getElementById('history-list');
  
  if (promptHistory.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #999;">No prompt history yet</p>';
    return;
  }
  
  container.innerHTML = promptHistory.slice(0, 100).map(item => `
    <div class="history-item">
      <div class="prompt-text">${escapeHtml(item.prompt)}</div>
      <div class="history-actions">
        <button data-action="import" data-id="history_${item.id}" class="import-btn-small">Import</button>
        <div class="timestamp">${new Date(item.timestamp).toLocaleString()}</div>
        <span class="favorite" onclick="toggleFavorite('${item.id}')">${item.favorite ? '⭐' : '☆'}</span>
      </div>
    </div>
  `).join('');
}

function showPromptModal(prompt = null) {
  const modal = document.getElementById('prompt-modal');
  const title = document.getElementById('modal-title');
  const form = document.getElementById('prompt-form');
  
  if (prompt) {
    title.textContent = 'Edit Prompt';
    document.getElementById('prompt-name').value = prompt.name;
    document.getElementById('prompt-category').value = prompt.category;
    document.getElementById('prompt-template').value = prompt.template;
    document.getElementById('prompt-public').checked = prompt.public || false;
  } else {
    title.textContent = 'New Prompt';
    form.reset();
  }
  
  modal.classList.add('active');
}

function hidePromptModal() {
  document.getElementById('prompt-modal').classList.remove('active');
  currentEditingPrompt = null;
}

function showChainModal(chain = null) {
  console.log('showChainModal called with chain:', chain);
  const modal = document.getElementById('chain-modal');
  const title = document.getElementById('chain-modal-title');
  const form = document.getElementById('chain-form');
  
  console.log('Modal element found:', modal);
  console.log('Title element found:', title);
  console.log('Form element found:', form);
  
  if (chain) {
    title.textContent = 'Edit Prompt Chain';
    document.getElementById('chain-name').value = chain.name;
    document.getElementById('chain-description').value = chain.description || '';
    
    // Load chain steps
    const container = document.getElementById('chain-steps-container');
    container.innerHTML = chain.steps.map(step => `
      <div class="chain-step-item">
        <input type="text" placeholder="Step name" class="step-name" value="${escapeHtml(step.name)}" required>
        <textarea placeholder="Step prompt template" class="step-template" rows="3" required>${escapeHtml(step.template)}</textarea>
        <button type="button" class="remove-step-btn" data-action="remove-step">Remove</button>
      </div>
    `).join('');
  } else {
    title.textContent = 'Create Prompt Chain';
    form.reset();
    
    // Reset to one empty step
    const container = document.getElementById('chain-steps-container');
    container.innerHTML = `
      <div class="chain-step-item">
        <input type="text" placeholder="Step name" class="step-name" required>
        <textarea placeholder="Step prompt template" class="step-template" rows="3" required></textarea>
        <button type="button" class="remove-step-btn" data-action="remove-step">Remove</button>
      </div>
    `;
  }
  
  modal.classList.add('active');
}

function hideChainModal() {
  document.getElementById('chain-modal').classList.remove('active');
  currentEditingChain = null;
}

function addChainStep() {
  const container = document.getElementById('chain-steps-container');
  const newStep = document.createElement('div');
  newStep.className = 'chain-step-item';
  newStep.innerHTML = `
    <input type="text" placeholder="Step name" class="step-name" required>
    <textarea placeholder="Step prompt template" class="step-template" rows="3" required></textarea>
    <button type="button" class="remove-step-btn" onclick="removeChainStep(this)">Remove</button>
  `;
  container.appendChild(newStep);
}

function removeChainStep(button) {
  const container = document.getElementById('chain-steps-container');
  if (container.children.length > 1) {
    button.parentElement.remove();
  } else {
    alert('A chain must have at least one step.');
  }
}

async function saveChain(e) {
  e.preventDefault();
  
  const name = document.getElementById('chain-name').value;
  const description = document.getElementById('chain-description').value;
  
  // Collect steps
  const stepItems = document.querySelectorAll('.chain-step-item');
  const steps = Array.from(stepItems).map(item => ({
    name: item.querySelector('.step-name').value,
    template: item.querySelector('.step-template').value
  }));
  
  if (steps.length === 0) {
    alert('Please add at least one step to the chain.');
    return;
  }
  
  const chainData = {
    id: currentEditingChain || `chain-${Date.now()}`,
    name,
    description,
    steps,
    created: currentEditingChain ? promptChains.find(c => c.id === currentEditingChain)?.created : Date.now(),
    updated: Date.now()
  };
  
  if (currentEditingChain) {
    const index = promptChains.findIndex(c => c.id === currentEditingChain);
    if (index !== -1) {
      promptChains[index] = chainData;
    }
  } else {
    promptChains.push(chainData);
  }
  
  await chrome.storage.local.set({ promptChains });
  hideChainModal();
  renderPromptChains();
}

async function savePrompt(e) {
  e.preventDefault();
  
  const promptData = {
    id: currentEditingPrompt || `prompt-${Date.now()}`,
    name: document.getElementById('prompt-name').value,
    category: document.getElementById('prompt-category').value,
    template: document.getElementById('prompt-template').value,
    public: document.getElementById('prompt-public').checked,
    created: currentEditingPrompt ? prompts.find(p => p.id === currentEditingPrompt)?.created : Date.now(),
    updated: Date.now()
  };
  
  if (currentEditingPrompt) {
    const index = prompts.findIndex(p => p.id === currentEditingPrompt);
    if (index !== -1) {
      prompts[index] = promptData;
    }
  } else {
    prompts.push(promptData);
  }
  
  await chrome.storage.local.set({ prompts });
  hidePromptModal();
  renderMyPrompts();
}

window.editPrompt = function(id) {
  console.log('Edit prompt called with id:', id);
  const prompt = prompts.find(p => p.id === id);
  if (prompt) {
    currentEditingPrompt = id;
    showPromptModal(prompt);
  }
};

window.duplicatePrompt = async function(id) {
  console.log('Duplicate prompt called with id:', id);
  const prompt = prompts.find(p => p.id === id);
  if (prompt) {
    const newPrompt = {
      ...prompt,
      id: `prompt-${Date.now()}`,
      name: prompt.name + ' (Copy)',
      created: Date.now(),
      updated: Date.now()
    };
    prompts.push(newPrompt);
    await chrome.storage.local.set({ prompts });
    renderMyPrompts();
  }
};

window.deletePrompt = async function(id) {
  if (confirm('Are you sure you want to delete this prompt?')) {
    prompts = prompts.filter(p => p.id !== id);
    await chrome.storage.local.set({ prompts });
    renderMyPrompts();
  }
};

window.importPrompt = async function(id) {
  // In a real implementation, this would fetch from a server
  alert('Prompt imported successfully!');
};

window.previewPrompt = function(id) {
  alert('Preview functionality coming soon!');
};

let currentEditingChain = null;

function createPromptChain() {
  console.log('createPromptChain function called');
  currentEditingChain = null;
  showChainModal();
}

function editChain(id) {
  const chain = promptChains.find(c => c.id === id);
  if (chain) {
    currentEditingChain = id;
    showChainModal(chain);
  }
}

async function runChain(id) {
  const chain = promptChains.find(c => c.id === id);
  if (!chain) return;
  
  try {
    // Find the best Gemini tab to use
    const geminiTab = await findBestGeminiTab();
    if (!geminiTab) {
      alert('Please open Gemini (https://gemini.google.com) in a tab to run the chain.');
      return;
    }
    
    // Show progress
    const progressContainer = document.getElementById(`progress-${id}`);
    const progressSteps = document.getElementById(`progress-steps-${id}`);
    progressContainer.classList.add('active');
    
    // Initialize progress display
    progressSteps.innerHTML = chain.steps.map((step, i) => 
      `<div class="chain-step-progress pending" id="step-${id}-${i}">${i + 1}. ${escapeHtml(step.name)}</div>`
    ).join('');
    
    // Switch to Gemini tab and focus its window
    await chrome.tabs.update(geminiTab.id, { active: true });
    await chrome.windows.update(geminiTab.windowId, { focused: true });
    
    // Run each step with delays
    for (let i = 0; i < chain.steps.length; i++) {
      const step = chain.steps[i];
      const stepElement = document.getElementById(`step-${id}-${i}`);
      
      try {
        // Mark as running
        stepElement.className = 'chain-step-progress running';
        stepElement.textContent = `${i + 1}. ${step.name} - Running...`;
        
        // Execute the prompt
        await chrome.scripting.executeScript({
          target: { tabId: geminiTab.id },
          func: insertPromptDirectly,
          args: [step.template]
        });
        
        // Mark as completed
        stepElement.className = 'chain-step-progress completed';
        stepElement.textContent = `${i + 1}. ${step.name} - Completed`;
        
        // Wait before next step (except for last step)
        if (i < chain.steps.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
      } catch (error) {
        // Mark as error
        stepElement.className = 'chain-step-progress error';
        stepElement.textContent = `${i + 1}. ${step.name} - Error: ${error.message}`;
        console.error('Chain step error:', error);
        break;
      }
    }
    
    // Hide progress after completion
    setTimeout(() => {
      progressContainer.classList.remove('active');
    }, 5000);
    
  } catch (error) {
    console.error('Chain execution error:', error);
    alert('Error running chain: ' + error.message);
  }
};

async function duplicateChain(id) {
  const chain = promptChains.find(c => c.id === id);
  if (chain) {
    const newChain = {
      ...chain,
      id: `chain-${Date.now()}`,
      name: chain.name + ' (Copy)',
      created: Date.now(),
      updated: Date.now()
    };
    promptChains.push(newChain);
    await chrome.storage.local.set({ promptChains });
    renderPromptChains();
  }
}

async function deleteChain(id) {
  if (confirm('Are you sure you want to delete this prompt chain?')) {
    promptChains = promptChains.filter(c => c.id !== id);
    await chrome.storage.local.set({ promptChains });
    renderPromptChains();
  }
}

window.toggleFavorite = async function(id) {
  const item = promptHistory.find(h => h.id === id);
  if (item) {
    item.favorite = !item.favorite;
    await chrome.storage.local.set({ promptHistory });
    renderHistory();
  }
};

async function importToChat(id) {
  console.log('importToChat called with id:', id);
  let promptTemplate = '';
  
  if (id.startsWith('pub_')) {
    const publicPromptId = id.replace('pub_', '');
    const samplePublicPrompts = [
      { id: 'pub1', template: 'Review this code and suggest improvements: {{code}}' },
      { id: 'pub2', template: 'Explain {{concept}} in simple terms that a 5-year-old would understand' },
      { id: 'pub3', template: 'Translate the following text from {{source_language}} to {{target_language}}: {{text}}' }
    ];
    const publicPrompt = samplePublicPrompts.find(p => p.id === publicPromptId);
    promptTemplate = publicPrompt ? publicPrompt.template : '';
  } else if (id.startsWith('history_')) {
    const historyId = id.replace('history_', '');
    const historyItem = promptHistory.find(h => h.id === historyId);
    promptTemplate = historyItem ? historyItem.prompt : '';
  } else {
    const prompt = prompts.find(p => p.id === id);
    promptTemplate = prompt ? prompt.template : '';
  }
  
  if (promptTemplate) {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        // Find the best Gemini tab to use
        const geminiTab = await findBestGeminiTab();
        
        if (geminiTab) {
          console.log('Found Gemini tab:', geminiTab.id, 'in window:', geminiTab.windowId);
          
          // Try direct script execution first (most reliable)
          try {
            await chrome.scripting.executeScript({
              target: { tabId: geminiTab.id },
              func: insertPromptDirectly,
              args: [promptTemplate]
            });
            
            // Switch to Gemini tab and focus its window
            await chrome.tabs.update(geminiTab.id, { active: true });
            await chrome.windows.update(geminiTab.windowId, { focused: true });
            
            if (window.close) {
              window.close();
            }
            return;
          } catch (directError) {
            console.log('Direct script method failed, trying content script...', directError);
          }
          
          // Fallback: Try content script method
          try {
            const response = await chrome.tabs.sendMessage(geminiTab.id, {
              action: 'insertPrompt',
              prompt: promptTemplate
            });
            
            if (response && response.success) {
              await chrome.tabs.update(geminiTab.id, { active: true });
              await chrome.windows.update(geminiTab.windowId, { focused: true });
              if (window.close) {
                window.close();
              }
            } else {
              // Final fallback: direct script injection
              await chrome.scripting.executeScript({
                target: { tabId: geminiTab.id },
                func: insertPromptDirectly,
                args: [promptTemplate]
              });
              
              await chrome.tabs.update(geminiTab.id, { active: true });
              await chrome.windows.update(geminiTab.windowId, { focused: true });
              if (window.close) {
                window.close();
              }
            }
          } catch (scriptError) {
            console.error('All methods failed:', scriptError);
            
            // Ultimate fallback: just copy to clipboard and give instructions
            try {
              await navigator.clipboard.writeText(promptTemplate);
              alert('Automatic insertion failed, but prompt is copied to clipboard.\n\nPlease:\n1. Go to your Gemini tab\n2. Click in the chat input\n3. Press Ctrl+V (or Cmd+V) to paste\n4. Press Enter to send');
            } catch (finalError) {
              alert('Could not import prompt automatically.\n\nPrompt text:\n' + promptTemplate + '\n\nPlease copy this text and paste it manually into Gemini.');
            }
          }
        } else {
          alert('Please open Gemini (https://gemini.google.com) in a tab to import prompts.');
        }
      } else {
        // Not in extension context, just show the prompt
        alert('Prompt text:\n' + promptTemplate + '\n\nPlease copy this text and paste it into Gemini.');
      }
    } catch (error) {
      console.error('Error importing to chat:', error);
      alert('Error importing prompt. Here\'s the text to copy manually:\n\n' + promptTemplate);
    }
  } else {
    alert('No prompt template found for the selected item.');
  }
};

function handleSearch(e) {
  const activeTab = document.querySelector('.tab.active').getAttribute('data-tab');
  if (activeTab === 'my-prompts') {
    renderMyPrompts();
  }
}

function handleFilter(e) {
  const activeTab = document.querySelector('.tab.active').getAttribute('data-tab');
  if (activeTab === 'my-prompts') {
    renderMyPrompts();
  }
}

