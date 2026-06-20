// 后台服务脚本
chrome.runtime.onInstalled.addListener(() => {
  console.log('慕课自动刷课助手已安装');
  
  // 初始化默认设置
  chrome.storage.local.set({
    autoPlay: true,
    autoNext: true,
    muteVideo: false,
    playbackRate: 1,
    switchDelay: 3,
    isRunning: false,
    completedCount: 0
  });
});

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'videoCompleted') {
    // 更新完成计数
    chrome.storage.local.get(['completedCount'], (result) => {
      const count = (result.completedCount || 0) + 1;
      chrome.storage.local.set({ completedCount: count });
      
      // 更新badge
      chrome.action.setBadgeText({ text: count.toString() });
      chrome.action.setBadgeBackgroundColor({ color: '#667eea' });
    });
  }
  
  return true;
});

// 监听标签页关闭
chrome.tabs.onRemoved.addListener((tabId) => {
  // 可以在这里处理标签页关闭逻辑
});

// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // 检查是否是目标网站
    if (tab.url.includes('mxdxedu.com')) {
      // 可以在这里注入额外的脚本或执行操作
    }
  }
});