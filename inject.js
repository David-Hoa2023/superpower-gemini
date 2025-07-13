// Injected script for deeper Gemini integration

(function() {
  'use strict';
  
  // Override XMLHttpRequest to intercept API calls
  const originalXHR = window.XMLHttpRequest;
  const interceptedRequests = new Map();
  
  window.XMLHttpRequest = function() {
    const xhr = new originalXHR();
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    
    xhr.open = function(method, url, ...args) {
      xhr._method = method;
      xhr._url = url;
      return originalOpen.apply(xhr, [method, url, ...args]);
    };
    
    xhr.send = function(body) {
      if (xhr._url && xhr._url.includes('gemini.google.com')) {
        // Intercept Gemini API requests
        xhr.addEventListener('load', function() {
          if (this.responseText) {
            try {
              const response = JSON.parse(this.responseText);
              handleGeminiResponse(xhr._url, response);
            } catch (e) {
              // Not JSON response
            }
          }
        });
        
        // Handle request body for prompt tracking
        if (body && xhr._method === 'POST') {
          try {
            const requestData = JSON.parse(body);
            if (requestData.prompt || requestData.message) {
              trackPrompt(requestData.prompt || requestData.message);
            }
          } catch (e) {
            // Not JSON body
          }
        }
      }
      
      return originalSend.apply(xhr, [body]);
    };
    
    return xhr;
  };
  
  // Handle Gemini responses
  function handleGeminiResponse(url, response) {
    // Extract conversation data
    if (response.conversation || response.messages) {
      window.postMessage({
        type: 'GEMINI_CONVERSATION_UPDATE',
        data: {
          url,
          conversation: response.conversation,
          messages: response.messages
        }
      }, '*');
    }
  }
  
  // Track prompts
  function trackPrompt(prompt) {
    const promptData = { 
      prompt: prompt, 
      timestamp: Date.now(),
      id: 'prompt-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
    };
    
    window.postMessage({
      type: 'GEMINI_PROMPT_SENT',
      data: promptData
    }, '*');
  }
  
  // Enhance input field
  function enhanceInputField() {
    const observer = new MutationObserver(() => {
      const inputField = document.querySelector('textarea, [contenteditable="true"]');
      if (inputField && !inputField.dataset.enhanced) {
        inputField.dataset.enhanced = 'true';
        
        // Add autocomplete functionality
        inputField.addEventListener('input', handleAutocomplete);
        inputField.addEventListener('keydown', handleShortcuts);
        
        // Track when user presses Enter to send prompt
        inputField.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
            const promptText = this.value || this.textContent;
            if (promptText && promptText.trim()) {
              setTimeout(() => {
                trackPrompt(promptText.trim());
              }, 100);
            }
          }
        });
      }
      
      // Also monitor send buttons
      const sendButtons = document.querySelectorAll('button[aria-label*="Send"], button[title*="Send"], button[data-testid*="send"]');
      sendButtons.forEach(button => {
        if (!button.dataset.enhanced) {
          button.dataset.enhanced = 'true';
          button.addEventListener('click', () => {
            const inputField = document.querySelector('textarea, [contenteditable="true"]');
            if (inputField) {
              const promptText = inputField.value || inputField.textContent;
              if (promptText && promptText.trim()) {
                setTimeout(() => {
                  trackPrompt(promptText.trim());
                }, 100);
              }
            }
          });
        }
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  // Handle autocomplete
  let autocompleteMenu = null;
  
  function handleAutocomplete(e) {
    const value = e.target.value || e.target.textContent;
    if (value.endsWith('/')) {
      showAutocompleteMenu(e.target);
    } else if (autocompleteMenu) {
      hideAutocompleteMenu();
    }
  }
  
  function showAutocompleteMenu(inputElement) {
    if (!autocompleteMenu) {
      autocompleteMenu = document.createElement('div');
      autocompleteMenu.className = 'gemini-superpower-autocomplete';
      autocompleteMenu.style.cssText = `
        position: absolute;
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 10000;
        max-height: 200px;
        overflow-y: auto;
      `;
    }
    
    // Get prompts from storage
    window.postMessage({
      type: 'GET_PROMPTS_FOR_AUTOCOMPLETE'
    }, '*');
    
    // Position menu
    const rect = inputElement.getBoundingClientRect();
    autocompleteMenu.style.left = rect.left + 'px';
    autocompleteMenu.style.top = (rect.bottom + 5) + 'px';
    autocompleteMenu.style.width = rect.width + 'px';
    
    document.body.appendChild(autocompleteMenu);
  }
  
  function hideAutocompleteMenu() {
    if (autocompleteMenu && autocompleteMenu.parentNode) {
      autocompleteMenu.parentNode.removeChild(autocompleteMenu);
    }
  }
  
  // Handle keyboard shortcuts
  function handleShortcuts(e) {
    // Up/Down arrows for prompt history
    if (e.key === 'ArrowUp' && e.ctrlKey) {
      e.preventDefault();
      window.postMessage({ type: 'NAVIGATE_PROMPT_HISTORY', direction: 'up' }, '*');
    } else if (e.key === 'ArrowDown' && e.ctrlKey) {
      e.preventDefault();
      window.postMessage({ type: 'NAVIGATE_PROMPT_HISTORY', direction: 'down' }, '*');
    }
  }
  
  // Listen for messages from content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    switch (event.data.type) {
      case 'PROMPTS_FOR_AUTOCOMPLETE':
        if (autocompleteMenu && event.data.prompts) {
          displayAutocompletePrompts(event.data.prompts);
        }
        break;
        
      case 'INSERT_PROMPT_FROM_HISTORY':
        insertPromptIntoInput(event.data.prompt);
        break;
    }
  });
  
  function displayAutocompletePrompts(prompts) {
    if (!autocompleteMenu) return;
    
    autocompleteMenu.innerHTML = prompts.map((prompt, index) => `
      <div class="autocomplete-item" data-index="${index}" style="
        padding: 8px 12px;
        cursor: pointer;
        border-bottom: 1px solid #f0f0f0;
      ">
        <div style="font-weight: 500;">${prompt.name}</div>
        <div style="font-size: 12px; color: #666;">${prompt.template.substring(0, 50)}...</div>
      </div>
    `).join('');
    
    // Add click handlers
    autocompleteMenu.querySelectorAll('.autocomplete-item').forEach((item, index) => {
      item.addEventListener('click', () => {
        insertPromptIntoInput(prompts[index].template);
        hideAutocompleteMenu();
      });
      
      item.addEventListener('mouseenter', () => {
        item.style.background = '#f5f5f5';
      });
      
      item.addEventListener('mouseleave', () => {
        item.style.background = 'white';
      });
    });
  }
  
  function insertPromptIntoInput(prompt) {
    const inputField = document.querySelector('textarea, [contenteditable="true"]');
    if (inputField) {
      if (inputField.tagName === 'TEXTAREA') {
        inputField.value = prompt;
      } else {
        inputField.textContent = prompt;
      }
      
      // Trigger input event
      const event = new Event('input', { bubbles: true });
      inputField.dispatchEvent(event);
      
      // Focus and move cursor to end
      inputField.focus();
      if (inputField.tagName === 'TEXTAREA') {
        inputField.setSelectionRange(inputField.value.length, inputField.value.length);
      }
    }
  }
  
  // Initialize
  enhanceInputField();
  
  // Export for debugging
  window.GeminiSuperpower = {
    version: '1.0.0',
    interceptedRequests
  };
})();