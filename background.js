// =====================================================
// Bookmark Extender – Background Service Worker v1.1
// =====================================================

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'bke-save',
    title: '📚 Save to Bookmark Extender',
    contexts: ['page', 'link'],
  });
});

// Context menu → quick save
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'BKE_QUICK_SAVE' }).catch(() => {});
});

// Toolbar icon click → toggle panel (no popup)
chrome.action.onClicked.addListener(tab => {
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'BKE_TOGGLE' }).catch(() => {});
});

// Keyboard commands
chrome.commands.onCommand.addListener((cmd, tab) => {
  if (!tab?.id) return;
  if (cmd === 'toggle-panel') chrome.tabs.sendMessage(tab.id, { type: 'BKE_TOGGLE'     }).catch(() => {});
  if (cmd === 'quick-save')   chrome.tabs.sendMessage(tab.id, { type: 'BKE_QUICK_SAVE' }).catch(() => {});
});
