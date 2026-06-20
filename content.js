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
  
  let videoObserver = null;
  let completionTimer = null;
  let currentVideoSrc = '';
  let completedVideos = new Set();
  
  // 日志函数
  function log(msg) {
    console.log(`[慕课助手] ${msg}`);
  }
  
  // 获取当前视频标识
  function getVideoId() {
    // 尝试多种方式获取视频标识
    const video = findVideo();
    if (video) {
      // 使用视频src作为标识
      if (video.src) return video.src;
      if (video.currentSrc) return video.currentSrc;
    }
    
    // 使用页面URL作为标识
    return window.location.href;
  }
  
  // 加载已完成视频列表
  async function loadCompletedVideos() {
    try {
      const result = await chrome.storage.local.get(['completedVideos']);
      if (result.completedVideos) {
        completedVideos = new Set(result.completedVideos);
        log(`已加载 ${completedVideos.size} 个已完成视频`);
      }
    } catch (e) {
      log('加载已完成视频失败: ' + e.message);
    }
  }
  
  // 保存已完成视频
  async function saveCompletedVideo(videoId) {
    try {
      completedVideos.add(videoId);
      await chrome.storage.local.set({ 
        completedVideos: Array.from(completedVideos)
      });
      log(`已保存视频完成状态: ${videoId.substring(0, 50)}...`);
    } catch (e) {
      log('保存视频完成状态失败: ' + e.message);
    }
  }
  
  // 检查视频是否已完成
  function isVideoCompleted(videoId) {
    return completedVideos.has(videoId);
  }
  
  // 查找视频元素
  function findVideo() {
    // 尝试多种选择器
    const selectors = [
      'video',
      '.video-js video',
      '#player video',
      '.prism-player video',
      '.vjs-tech',
      'iframe'
    ];
    
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    
    return null;
  }
  
  // 查找iframe中的视频
  function findVideoInIframes() {
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        const video = doc.querySelector('video');
        if (video) return { video, iframe };
      } catch (e) {
        // 跨域iframe无法访问
      }
    }
    return null;
  }
  
  // 设置视频属性
  function setupVideo(video) {
    if (!video || video.dataset.autoSetup === 'true') return;
    
    log('设置视频属性');
    video.dataset.autoSetup = 'true';
    
    // 检查是否需要跳过已播放视频
    if (settings.skipCompleted) {
      const videoId = getVideoId();
      if (isVideoCompleted(videoId)) {
        log('视频已播放过，准备跳过');
        if (settings.autoNext) {
          setTimeout(() => {
            goToNextVideo();
          }, 1000);
          return;
        }
      }
    }
    
    // 静音
    if (settings.muteVideo) {
      video.muted = true;
    }
    
    // 设置播放速度
    try {
      video.playbackRate = settings.playbackRate;
    } catch (e) {
      log('设置播放速度失败: ' + e.message);
    }
    
    // 移除暂停事件监听器（防止自动暂停）
    video.addEventListener('pause', () => {
      if (isRunning && video.ended === false) {
        setTimeout(() => {
          video.play().catch(() => {});
        }, 500);
      }
    });
    
    // 监听视频结束
    video.addEventListener('ended', () => {
      if (isRunning && settings.autoNext) {
        log('视频播放完成，准备切换下一集');
        // 保存已完成视频
        saveCompletedVideo(getVideoId());
        notifyVideoCompleted();
        setTimeout(() => {
          goToNextVideo();
        }, settings.switchDelay * 1000);
      }
    });
    
    // 监听视频进度（用于检测接近完成）
    video.addEventListener('timeupdate', () => {
      if (isRunning && video.duration > 0) {
        const progress = video.currentTime / video.duration;
        // 当进度超过95%时，标记为即将完成
        if (progress > 0.95 && !video.dataset.nearComplete) {
          video.dataset.nearComplete = 'true';
          log('视频即将完成 (进度: ' + Math.round(progress * 100) + '%)');
        }
      }
    });
    
    // 监听视频错误
    video.addEventListener('error', () => {
      if (isRunning) {
        log('视频播放错误，尝试恢复');
        setTimeout(() => {
          video.load();
          video.play().catch(() => {});
        }, 2000);
      }
    });
    
    // 自动播放
    if (settings.autoPlay) {
      video.play().catch(() => {
        log('自动播放被阻止，尝试静音播放');
        video.muted = true;
        video.play().catch(() => {});
      });
    }
  }
  
  // 通知视频完成
  function notifyVideoCompleted() {
    // 保存已完成视频
    saveCompletedVideo(getVideoId());
    chrome.runtime.sendMessage({ type: 'videoCompleted' });
  }
  
  // 切换到下一集
  function goToNextVideo() {
    log('查找下一集按钮');
    
    // 常见的下一集按钮选择器
    const nextSelectors = [
      // 按钮文字匹配
      'button:contains("下一集")',
      'a:contains("下一集")',
      'span:contains("下一集")',
      'div:contains("下一集")',
      // 类名匹配
      '.next-btn',
      '.next-episode',
      '.btn-next',
      '[class*="next"]',
      // 图标匹配
      '.next-icon',
      '.icon-next',
      // 课程列表中的下一个
      '.chapter-item.active + .chapter-item a',
      '.lesson-item.active + .lesson-item a',
      '.video-item.active + .video-item a',
      '.course-item.active + .course-item a'
    ];
    
    // 尝试通过文字查找
    const allElements = document.querySelectorAll('button, a, span, div, li');
    for (const el of allElements) {
      const text = el.textContent.trim();
      if (text === '下一集' || text === '下一个' || text === '下一课' || 
          text === '下一节' || text.includes('下一') || text === 'Next') {
        log('找到下一集按钮: ' + text);
        el.click();
        
        // 跳过已播放功能：检查下一集是否也已播放
        if (settings.skipCompleted) {
          setTimeout(() => {
            checkAndSkipCompleted();
          }, 2000);
        }
        return;
      }
    }
    
    // 尝试通过选择器查找
    for (const selector of nextSelectors) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          log('找到下一集元素: ' + selector);
          el.click();
          
          // 跳过已播放功能：检查下一集是否也已播放
          if (settings.skipCompleted) {
            setTimeout(() => {
              checkAndSkipCompleted();
            }, 2000);
          }
          return;
        }
      } catch (e) {
        // 选择器语法错误，跳过
      }
    }
    
    // 查找课程列表中当前项的下一个
    const activeItem = document.querySelector('.active, .current, .playing, [class*="active"]');
    if (activeItem) {
      const nextItem = activeItem.nextElementSibling;
      if (nextItem) {
        const link = nextItem.querySelector('a') || nextItem;
        log('通过列表顺序切换');
        link.click();
        
        // 跳过已播放功能：检查下一集是否也已播放
        if (settings.skipCompleted) {
          setTimeout(() => {
            checkAndSkipCompleted();
          }, 2000);
        }
        return;
      }
    }
    
    log('未找到下一集按钮');
  }
  
  // 检查并跳过已播放视频
  function checkAndSkipCompleted() {
    if (!isRunning || !settings.skipCompleted) return;
    
    const videoId = getVideoId();
    if (isVideoCompleted(videoId)) {
      log('检测到下一集已播放过，继续跳过');
      setTimeout(() => {
        goToNextVideo();
      }, 1000);
    }
  }
  
  // 防检测：模拟人类行为
  function simulateHumanBehavior() {
    if (!isRunning) return;
    
    // 随机鼠标移动
    const x = Math.random() * window.innerWidth;
    const y = Math.random() * window.innerHeight;
    
    const event = new MouseEvent('mousemove', {
      clientX: x,
      clientY: y,
      bubbles: true
    });
    document.dispatchEvent(event);
    
    // 随机滚动
    if (Math.random() > 0.7) {
      window.scrollBy(0, Math.random() * 50 - 25);
    }
    
    // 继续模拟
    setTimeout(() => simulateHumanBehavior(), 30000 + Math.random() * 60000);
  }
  
  // 处理页面内视频
  function handlePageVideo() {
    const video = findVideo();
    if (video) {
      setupVideo(video);
      return true;
    }
    return false;
  }
  
  // 处理iframe中的视频
  function handleIframeVideo() {
    const result = findVideoInIframes();
    if (result) {
      setupVideo(result.video);
      return true;
    }
    return false;
  }
  
  // 视频检测循环
  function startVideoDetection() {
    log('开始检测视频');
    
    const checkInterval = setInterval(() => {
      if (!isRunning) {
        clearInterval(checkInterval);
        return;
      }
      
      if (!handlePageVideo()) {
        handleIframeVideo();
      }
    }, 2000);
  }
  
  // 监听页面变化（SPA应用）
  function observePageChanges() {
    const observer = new MutationObserver((mutations) => {
      if (!isRunning) return;
      
      for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
          // 检查是否有新视频加载
          setTimeout(() => {
            handlePageVideo();
            handleIframeVideo();
          }, 1000);
        }
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    return observer;
  }
  
  // 启动自动播放
  async function startAutoPlay(newSettings) {
    if (isRunning) return;
    
    isRunning = true;
    settings = { ...settings, ...newSettings };
    
    log('启动自动播放');
    log('设置: ' + JSON.stringify(settings));
    
    // 加载已完成视频列表
    await loadCompletedVideos();
    
    // 保存设置
    chrome.storage.local.set({ isRunning: true, settings });
    
    // 开始检测视频
    startVideoDetection();
    
    // 监听页面变化
    videoObserver = observePageChanges();
    
    // 模拟人类行为
    simulateHumanBehavior();
    
    // 立即检查当前页面
    handlePageVideo();
    handleIframeVideo();
  }
  
  // 停止自动播放
  function stopAutoPlay() {
    isRunning = false;
    log('停止自动播放');
    
    if (videoObserver) {
      videoObserver.disconnect();
      videoObserver = null;
    }
    
    chrome.storage.local.set({ isRunning: false });
  }
  
  // 监听来自popup的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'startAutoPlay':
        startAutoPlay(message.settings);
        sendResponse({ success: true });
        break;
        
      case 'stopAutoPlay':
        stopAutoPlay();
        sendResponse({ success: true });
        break;
        
      case 'getStatus':
        sendResponse({ isRunning });
        break;
    }
    return true;
  });
  
  // 页面加载时检查是否应该自动启动
  chrome.storage.local.get(['isRunning', 'settings'], (result) => {
    if (result.isRunning) {
      log('检测到之前的运行状态，自动恢复');
      startAutoPlay(result.settings || {});
    }
  });
  
  log('慕课自动刷课助手已加载');
})();