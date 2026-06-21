// 后台服务脚本
chrome.runtime.onInstalled.addListener(function() {
  console.log('Extension installed');
  
  chrome.storage.local.set({
    autoPlay: true,
    autoNext: true,
    muteVideo: false,
    playbackRate: 1,
    switchDelay: 3,
    isRunning: false,
    completedCount: 0,
    completedVideos: []
  });
});

// 监听消息
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  try {
    if (message.type === 'videoCompleted') {
      chrome.storage.local.get(['completedCount'], function(result) {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false });
          return;
        }
        var count = (result.completedCount || 0) + 1;
        chrome.storage.local.set({ completedCount: count });
        
        try {
          chrome.action.setBadgeText({ text: String(count) });
          chrome.action.setBadgeBackgroundColor({ color: '#667eea' });
        } catch (e) {}
        
        sendResponse({ success: true, count: count });
      });
      return true; // 异步响应
    }
    
    sendResponse({ success: true });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
  return true;
});