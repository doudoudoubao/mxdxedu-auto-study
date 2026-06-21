(() => {
  'use strict';
  
  let isRunning = false;
  let settings = {
    autoPlay: true,
    autoNext: true,
    skipCompleted: true,
    muteVideo: false,
    playbackRate: 1,
    switchDelay: 3
  };
  
  let completedVideos = new Set();
  let lastProcessedUrl = '';
  let skipCount = 0;
  
  function log(msg) {
    console.log(`[慕课助手] ${msg}`);
  }
  
  // 获取页面唯一标识 - 使用完整URL
  function getPageId() {
    return window.location.href.split('?')[0].split('#')[0];
  }
  
  // 加载已完成视频
  async function loadCompletedVideos() {
    try {
      const result = await chrome.storage.local.get(['completedVideos']);
      if (result.completedVideos) {
        completedVideos = new Set(result.completedVideos);
      }
      log(`已加载 ${completedVideos.size} 个已完成视频`);
    } catch (e) {
      log('加载失败: ' + e.message);
    }
  }
  
  // 保存已完成视频
  async function saveCompleted() {
    try {
      const pageId = getPageId();
      completedVideos.add(pageId);
      await chrome.storage.local.set({ 
        completedVideos: Array.from(completedVideos) 
      });
      log(`已保存: ${pageId}`);
    } catch (e) {
      log('保存失败: ' + e.message);
    }
  }
  
  // 检查是否已完成
  function isCompleted() {
    return completedVideos.has(getPageId());
  }
  
  // 查找视频
  function findVideo() {
    // 优先查找iframe内的视频
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        const video = doc.querySelector('video');
        if (video) return video;
      } catch (e) {}
    }
    
    // 查找页面视频
    return document.querySelector('video');
  }
  
  // 点击下一个课程
  function clickNext() {
    log('尝试切换下一集...');
    
    // 方法1: 查找课程列表中的下一个未播放项
    const listItems = document.querySelectorAll('li, .item, [class*="lesson"], [class*="chapter"], [class*="video"]');
    let foundActive = false;
    
    for (const item of listItems) {
      const isActive = item.classList.contains('active') || 
                       item.classList.contains('current') || 
                       item.classList.contains('selected') ||
                       item.classList.contains('playing');
      
      if (isActive) {
        foundActive = true;
        continue;
      }
      
      if (foundActive) {
        const link = item.querySelector('a');
        if (link && link.href) {
          log('点击下一个课程项');
          link.click();
          return true;
        }
        // 如果没有a标签，尝试点击item本身
        if (item.onclick || item.querySelector('[onclick]')) {
          item.click();
          return true;
        }
      }
    }
    
    // 方法2: 查找"下一集"按钮
    const nextTexts = ['下一集', '下一个', '下一课', '下一节', '下一章', 'next', '>>'];
    const allElements = document.querySelectorAll('a, button, span, div, li');
    
    for (const el of allElements) {
      const text = (el.textContent || '').trim().toLowerCase();
      for (const nextText of nextTexts) {
        if (text === nextText || text.includes(nextText)) {
          log('点击下一集按钮: ' + el.textContent.trim());
          el.click();
          return true;
        }
      }
    }
    
    // 方法3: 查找类名包含next的元素
    const nextEl = document.querySelector('.next, .btn-next, .next-btn, [class*="next"], .icon-next, .icon-right');
    if (nextEl) {
      log('点击next类名元素');
      nextEl.click();
      return true;
    }
    
    log('未找到下一集');
    return false;
  }
  
  // 设置视频
  function setupVideo(video) {
    if (!video || video.dataset.setupDone) return;
    video.dataset.setupDone = 'true';
    
    log('设置视频');
    
    if (settings.muteVideo) {
      video.muted = true;
    }
    
    try {
      video.playbackRate = settings.playbackRate;
    } catch (e) {}
    
    // 视频结束事件
    video.addEventListener('ended', () => {
      if (!isRunning) return;
      log('视频播放结束');
      saveCompleted();
      chrome.runtime.sendMessage({ type: 'videoCompleted' });
      
      if (settings.autoNext) {
        setTimeout(() => clickNext(), settings.switchDelay * 1000);
      }
    });
    
    // 进度监控 - 95%标记完成
    video.addEventListener('timeupdate', () => {
      if (!isRunning || !video.duration) return;
      if (video.currentTime / video.duration > 0.95 && !video.dataset.marked) {
        video.dataset.marked = 'true';
        log('进度95%+，标记完成');
        saveCompleted();
      }
    });
    
    // 防止意外暂停
    video.addEventListener('pause', () => {
      if (isRunning && !video.ended && video.readyState > 2) {
        setTimeout(() => video.play().catch(() => {}), 1000);
      }
    });
    
    // 自动播放
    if (settings.autoPlay) {
      video.play().catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    }
  }
  
  // 检查并跳过已完成视频
  function checkSkip() {
    if (!isRunning || !settings.skipCompleted) return;
    
    const currentUrl = window.location.href;
    if (currentUrl === lastProcessedUrl) return;
    lastProcessedUrl = currentUrl;
    
    const pageId = getPageId();
    
    if (completedVideos.has(pageId)) {
      skipCount++;
      log(`视频已看过，跳过 #${skipCount}: ${pageId}`);
      
      if (skipCount > 50) {
        log('跳过次数过多，停止');
        return;
      }
      
      setTimeout(() => {
        if (!clickNext()) {
          log('无法找到下一集，尝试刷新页面列表');
        }
      }, 800);
    } else {
      skipCount = 0;
    }
  }
  
  // 主循环
  function mainLoop() {
    if (!isRunning) return;
    
    // 检查是否需要跳过
    checkSkip();
    
    // 查找并设置视频
    const video = findVideo();
    if (video) {
      setupVideo(video);
    }
  }
  
  // 监听URL变化
  function watchUrl() {
    let url = location.href;
    
    setInterval(() => {
      if (location.href !== url) {
        url = location.href;
        log('URL变化: ' + url);
        
        // 重置视频设置标记，让新视频能被设置
        const video = findVideo();
        if (video) {
          delete video.dataset.setupDone;
          delete video.dataset.marked;
        }
        
        // 延迟检查新页面
        setTimeout(() => {
          checkSkip();
          const newVideo = findVideo();
          if (newVideo) setupVideo(newVideo);
        }, 1500);
      }
    }, 500);
  }
  
  // 启动
  async function start(newSettings) {
    if (isRunning) return;
    isRunning = true;
    settings = { ...settings, ...newSettings };
    skipCount = 0;
    
    log('启动，设置: ' + JSON.stringify(settings));
    await loadCompletedVideos();
    
    chrome.storage.local.set({ isRunning: true, settings });
    
    // 立即检查当前页面
    checkSkip();
    
    // 启动主循环
    setInterval(mainLoop, 3000);
    
    // 监听URL变化
    watchUrl();
    
    // 模拟人类行为
    setInterval(() => {
      if (!isRunning) return;
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: Math.random() * window.innerWidth,
        clientY: Math.random() * window.innerHeight,
        bubbles: true
      }));
    }, 30000 + Math.random() * 60000);
  }
  
  // 停止
  function stop() {
    isRunning = false;
    skipCount = 0;
    log('停止');
    chrome.storage.local.set({ isRunning: false });
  }
  
  // 监听消息
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'startAutoPlay') {
      start(msg.settings);
      sendResponse({ success: true });
    } else if (msg.type === 'stopAutoPlay') {
      stop();
      sendResponse({ success: true });
    }
    return true;
  });
  
  // 自动恢复
  chrome.storage.local.get(['isRunning', 'settings'], (result) => {
    if (result.isRunning) {
      log('自动恢复运行');
      start(result.settings || {});
    }
  });
  
  log('慕课助手已加载');
})();