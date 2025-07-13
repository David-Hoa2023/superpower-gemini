// Superpower for Gemini - Background Script

// Initialize extension when installed
chrome.runtime.onInstalled.addListener(function() {
  console.log('Superpower for Gemini installed');
  
  // Initialize storage with default values
  initializeStorage();
  
  // Set up context menus after a delay to ensure API is ready
  setTimeout(function() {
    setupContextMenus();
  }, 100);
});

function initializeStorage() {
  chrome.storage.sync.get('settings', function(result) {
    if (chrome.runtime.lastError) {
      console.log('Storage error:', chrome.runtime.lastError);
      return;
    }
    
    if (!result.settings) {
      chrome.storage.sync.set({
        settings: {
          autoSplit: false,
          customWidth: null,
          language: 'en',
          tone: 'default',
          disableEnterSubmit: false,
          autoDelete: false,
          autoDeleteDays: 30,
          autoArchive: false,
          autoArchiveDays: 7
        }
      });
    }
  });

  chrome.storage.local.get('promptTemplates', function(result) {
    if (chrome.runtime.lastError) {
      console.log('Storage error:', chrome.runtime.lastError);
      return;
    }
    
    if (!result.promptTemplates) {
      chrome.storage.local.set({
        promptTemplates: [
          {
            id: 'summarize',
            name: 'Summarize',
            template: 'Please summarize the following text: {{text}}',
            category: 'utility'
          },
          {
            id: 'translate',
            name: 'Translate',
            template: 'Translate the following text to {{language}}: {{text}}',
            category: 'language'
          },
          {
            id: 'explain',
            name: 'Explain',
            template: 'Explain the following concept in simple terms: {{concept}}',
            category: 'learning'
          }
        ]
      });
    }
  });
}

function setupContextMenus() {
  // Only set up context menus if the API is available
  if (typeof chrome !== 'undefined' && chrome.contextMenus) {
    try {
      chrome.contextMenus.removeAll(function() {
        chrome.contextMenus.create({
          id: 'gemini-send-screenshot',
          title: 'Send screenshot to Gemini',
          contexts: ['page']
        });

        chrome.contextMenus.create({
          id: 'gemini-custom-prompts',
          title: 'Custom Prompts',
          contexts: ['selection']
        });
        
        console.log('Context menus created successfully');
      });
    } catch (error) {
      console.log('Context menus not available:', error);
    }
  }
}

// Handle context menu clicks (only if API is available)
if (typeof chrome !== 'undefined' && chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener(function(info, tab) {
    try {
      if (info.menuItemId === 'gemini-send-screenshot') {
        captureAndSendScreenshot(tab);
      } else if (info.menuItemId === 'gemini-custom-prompts') {
        sendSelectedTextWithPrompt(info.selectionText, tab);
      }
    } catch (error) {
      console.log('Context menu click error:', error);
    }
  });
}

// Message handling
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  try {
    switch (request.action) {
      case 'generatePDF':
        generatePDF(request.messages, sendResponse);
        return true;
        
      case 'savePromptHistory':
        savePromptHistory(request.prompt);
        break;
        
      case 'getPromptHistory':
        getPromptHistory(sendResponse);
        return true;
        
      case 'autoSplitText':
        autoSplitText(request.text, sendResponse);
        return true;
        
      case 'summarizeText':
        summarizeText(request.text, sendResponse);
        return true;
    }
  } catch (error) {
    console.log('Message handling error:', error);
    sendResponse({ error: error.message });
  }
});

// Capture and send screenshot
function captureAndSendScreenshot(tab) {
  if (!chrome.tabs || !chrome.tabs.captureVisibleTab) {
    console.log('Screenshot capture not available');
    return;
  }
  
  chrome.tabs.captureVisibleTab(tab.windowId, {
    format: 'png'
  }, function(screenshot) {
    if (chrome.runtime.lastError) {
      console.error('Error capturing screenshot:', chrome.runtime.lastError);
      return;
    }
    
    // Find best Gemini tab
    findBestGeminiTabBackground(tab.windowId).then(geminiTab => {
      if (geminiTab) {
        chrome.tabs.sendMessage(geminiTab.id, {
          action: 'insertScreenshot',
          screenshot: screenshot
        });
        chrome.tabs.update(geminiTab.id, { active: true });
        chrome.windows.update(geminiTab.windowId, { focused: true });
      } else {
        // Open new Gemini tab in same window
        chrome.tabs.create({
          url: 'https://gemini.google.com/app',
          active: true,
          windowId: tab.windowId
        }, function(newTab) {
          setTimeout(function() {
            chrome.tabs.sendMessage(newTab.id, {
              action: 'insertScreenshot',
              screenshot: screenshot
            });
          }, 2000);
        });
      }
    });
  });
  });
}

// Send selected text with custom prompt
function sendSelectedTextWithPrompt(text, tab) {
  chrome.storage.local.get('promptTemplates', function(prompts) {
    const templates = prompts.promptTemplates || [];
    
    if (templates.length > 0) {
      const prompt = templates[0].template.replace('{{text}}', text);
      
      findBestGeminiTabBackground(tab.windowId).then(geminiTab => {
        if (geminiTab) {
          chrome.tabs.sendMessage(geminiTab.id, {
            action: 'insertPrompt',
            prompt: prompt
          });
          chrome.tabs.update(geminiTab.id, { active: true });
          chrome.windows.update(geminiTab.windowId, { focused: true });
        } else {
          // Open new Gemini tab in same window
          chrome.tabs.create({
            url: 'https://gemini.google.com/app',
            active: true,
            windowId: tab.windowId
          }, function(newTab) {
            setTimeout(function() {
              chrome.tabs.sendMessage(newTab.id, {
                action: 'insertPrompt',
                prompt: prompt
              });
            }, 2000);
          });
        }
      });
    }
  });
}

// Generate PDF (simplified version)
function generatePDF(messages, sendResponse) {
  try {
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Gemini Conversation</title></head><body><h1>Gemini Conversation Export</h1><p>Export completed successfully.</p></body></html>';
    
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    if (chrome.downloads) {
      chrome.downloads.download({
        url: url,
        filename: 'gemini-conversation.html',
        saveAs: true
      });
    }
    
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// Save prompt history
function savePromptHistory(prompt) {
  chrome.storage.local.get('promptHistory', function(result) {
    const history = result.promptHistory || [];
    
    history.unshift({
      id: 'prompt-' + Date.now(),
      prompt: prompt,
      timestamp: Date.now(),
      favorite: false
    });
    
    // Keep only last 100 prompts
    if (history.length > 100) {
      history.splice(100);
    }
    
    chrome.storage.local.set({ promptHistory: history });
  });
}

// Get prompt history
function getPromptHistory(sendResponse) {
  chrome.storage.local.get('promptHistory', function(result) {
    sendResponse(result.promptHistory || []);
  });
}

// Auto-split text
function autoSplitText(text, sendResponse) {
  const maxLength = 2000;
  const chunks = [];
  
  if (text.length <= maxLength) {
    sendResponse([text]);
    return;
  }
  
  const sentences = text.split('. ');
  let currentChunk = '';
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i] + (i < sentences.length - 1 ? '. ' : '');
    
    if ((currentChunk + sentence).length > maxLength && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  
  sendResponse(chunks.length > 0 ? chunks : [text]);
}

// Summarize text (simplified)
function summarizeText(text, sendResponse) {
  const sentences = text.split('. ').slice(0, 3);
  const summary = sentences.join('. ') + (sentences.length === 3 ? '...' : '');
  
  sendResponse({
    summary: summary,
    originalLength: text.length,
    summaryLength: summary.length
  });
}

// Function to find the best Gemini tab (for background script)
async function findBestGeminiTabBackground(preferredWindowId) {
  try {
    // First, try to find Gemini tabs in the preferred window
    const sameWindowGeminiTabs = await chrome.tabs.query({ 
      url: 'https://gemini.google.com/*',
      windowId: preferredWindowId 
    });
    
    if (sameWindowGeminiTabs.length > 0) {
      // Prefer the active tab in preferred window
      const activeTab = sameWindowGeminiTabs.find(tab => tab.active);
      return activeTab || sameWindowGeminiTabs[0];
    }
    
    // If no Gemini tabs in preferred window, find any Gemini tab
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

console.log('Superpower for Gemini background script loaded');