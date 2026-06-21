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
  let completedVideos = new Set();
  let skipCounter = 0;
  const MAX_SKIP = 100;
  let lastUrl = '';
  
  function log(msg) {
    console.log(`[慕课助手] ${msg}`);
  }
  
  // 获取当前页面/视频的唯一标识
  function getPageId() {
    // 使用URL作为标识，去掉query参数中的时间戳等变化部分
    const url = new URL(window.location.href);
    // 保留主要参数，去掉可能变化的参数
    url.searchParams.delete('t');
    url.searchParams.delete('timestamp');
    url.searchParams.delete('_');
    return url.href;
  }
  
  // 从页面提取课程/视频标题
  function getLessonTitle() {
    const selectors = [
      '.lesson-title',
      '.video-title', 
      '.course-title',
      '.chapter-title',
      'h1', 'h2', 'h3',
      '.title',
      '[class*="title"]',
      '.active .name',
      '.current .name'
    ];
    
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.trim();
        if (text && text.length > 2 && text.length < 200) {
          return text;
        }
      }
    }
    return '';
  }
  
  // 综合获取视频标识
  function getVideoId() {
    const pageId = getPageId();
    const title = getLessonTitle();
    // 组合URL和标题作为唯一标识
    return title ? `${pageId}|||${title}` : pageId;
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
      log(`已保存视频完成状态`);
    } catch (e) {
      log('保存视频完成状态失败: ' + e.message);
    }
  }
  
  // 检查视频是否已完成
  function isVideoCompleted(videoId) {
    // 精确匹配
    if (completedVideos.has(videoId)) return true;
    
    // 检查URL部分匹配
    const urlPart = videoId.split('|||')[0];
    for (const completed of completedVideos) {
      if (completed.startsWith(urlPart)) return true;
    }
    
    return false;
  }
  
  // 查找视频元素
  function findVideo() {
    const selectors = [
      'video',
      '.video-js video',
      '#player video',
      '.prism-player video',
      '.vjs-tech video',
      'video[src]',
      'video source'
    ];
    
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.tagName === 'VIDEO') return el;
      if (el && el.parentElement && el.parentElement.tagName === 'VIDEO') return el.parentElement;
    }
    
    // 直接查找所有video标签
    const videos = document.querySelectorAll('video');
    if (videos.length > 0) return videos[0];
    
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
  
  // 查找并点击下一个未完成的课程
  function findAndClickNextUncompleted() {
    log('查找下一个未完成课程...');
    
    // 获取课程列表中的所有项目
    const itemSelectors = [
      '.lesson-item',
      '.chapter-item', 
      '.video-item',
      '.course-item',
      '.course-list li',
      '.chapter-list li',
      '.lesson-list li',
      '[class*="lesson"]',
      '[class*="chapter"]',
      '[class*="video-item"]',
      '.list-item',
      'li'
    ];
    
    let items = [];
    for (const sel of itemSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 1) {
        items = Array.from(found);
        break;
      }
    }
    
    if (items.length === 0) {
      log('未找到课程列表，尝试直接点击下一集');
      clickNextButton();
      return;
    }
    
    log(`找到 ${items.length} 个课程项目`);
    
    // 找到当前活跃项的索引
    let activeIndex = -1;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.classList.contains('active') || 
          item.classList.contains('current') || 
          item.classList.contains('playing') ||
          item.classList.contains('selected')) {
        activeIndex = i;
        break;
      }
    }
    
    // 从当前项之后开始查找未完成的课程
    for (let i = activeIndex + 1; i < items.length; i++) {
      const item = items[i];
      const link = item.querySelector('a') || item;
      const title = item.textContent.trim();
      
      // 检查是否有完成标记
      const hasCompleteMark = item.querySelector('.complete, .finished, .done, .icon-complete, [class*="complete"], [class*="finish"]') ||
                              item.classList.contains('complete') || 
                              item.classList.contains('finished') ||
                              item.classList.contains('done');
      
      // 检查是否已记录为完成
      const testUrl = link.href || '';
      const testId = testUrl + '|||' + title;
      const isRecordedCompleted = isVideoCompleted(testId);
      
      if (!hasCompleteMark && !isRecordedCompleted) {
        log(`找到未完成课程: ${title}`);
        link.click();
        skipCounter = 0;
        return;
      } else {
        log(`跳过已完成课程: ${title}`);
      }
    }
    
    // 如果所有后续课程都已完成，尝试点击下一集按钮
    log('所有后续课程都已完成，尝试点击下一集按钮');
    clickNextButton();
  }
  
  // 点击下一集按钮
  function clickNextButton() {
    // 通过文字查找
    const allElements = document.querySelectorAll('button, a, span, div');
    for (const el of allElements) {
      const text = el.textContent.trim();
      if (text === '下一集' || text === '下一个' || text === '下一课' || 
          text === '下一节' || text === '下一章' || text === 'Next' ||
          text === '>>' || text === '▶' || text === '▶▶') {
        log('找到下一集按钮: ' + text);
        el.click();
        return true;
      }
    }
    
    // 通过选择器查找
    const nextSelectors = [
      '.next-btn', '.btn-next', '[class*="next"]',
      '.next-episode', '.next-chapter', '.next-lesson',
      'button[title*="下一"]', 'a[title*="下一"]',
      '.icon-next', '.icon-right', '.arrow-right'
    ];
    
    for (const selector of nextSelectors) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          log('找到下一集元素: ' + selector);
          el.click();
          return true;
        }
      } catch (e) {}
    }
    
    // 查找当前活跃项的下一个兄弟元素
    const activeItem = document.querySelector('.active, .current, .playing, .selected, [class*="active"]');
    if (activeItem) {
      const nextItem = activeItem.nextElementSibling;
      if (nextItem) {
        const link = nextItem.querySelector('a') || nextItem;
        log('通过列表顺序切换到下一个');
        link.click();
        return true;
      }
    }
    
    log('未找到下一集');
    return false;
  }
  
  // 核心：检查并跳过已播放视频
  function checkAndSkip() {
    if (!isRunning || !settings.skipCompleted) return;
    if (skipCounter >= MAX_SKIP) {
      log('跳过次数过多，停止跳过');
      return;
    }
    
    const currentUrl = window.location.href;
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;
    
    const videoId = getVideoId();
    log(`检查视频: ${videoId.substring(0, 80)}...`);
    
    if (isVideoCompleted(videoId)) {
      skipCounter++;
      log(`视频已播放过，跳过 (${skipCounter}/${MAX_SKIP})`);
      
      // 立即跳转，不等待
      setTimeout(() => {
        findAndClickNextUncompleted();
      }, 500);
      return true;
    }
    
    skipCounter = 0;
    return false;
  }
  
  // 设置视频属性
  function setupVideo(video) {
    if (!video || video.dataset.autoSetup === 'true') return;
    
    // 先检查是否需要跳过
    if (checkAndSkip()) {
      return;
    }
    
    log('设置视频属性');
    video.dataset.autoSetup = 'true';
    
    if (settings.muteVideo) {
      video.muted = true;
    }
    
    try {
      video.playbackRate = settings.playbackRate;
    } catch (e) {
      log('设置播放速度失败: ' + e.message);
    }
    
    // 防止自动暂停
    video.addEventListener('pause', () => {
      if (isRunning && !video.ended && video.readyState > 2) {
        setTimeout(() => {
          video.play().catch(() => {});
        }, 500);
      }
    });
    
    // 视频结束处理
    video.addEventListener('ended', () => {
      if (isRunning) {
        log('视频播放完成');
        saveCompletedVideo(getVideoId());
        chrome.runtime.sendMessage({ type: 'videoCompleted' });
        
        if (settings.autoNext) {
          setTimeout(() => {
            findAndClickNextUncompleted();
          }, settings.switchDelay * 1000);
        }
      }
    });
    
    // 视频进度监控 - 95%时标记完成
    video.addEventListener('timeupdate', () => {
      if (isRunning && video.duration > 0) {
        const progress = video.currentTime / video.duration;
        if (progress > 0.95 && !video.dataset.markedComplete) {
          video.dataset.markedComplete = 'true';
          log('视频进度超过95%，标记为已完成');
          saveCompletedVideo(getVideoId());
        }
      }
    });
    
    // 视频错误恢复
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
  
  // 处理视频
  function handleVideo() {
    const video = findVideo();
    if (video) {
      setupVideo(video);
      return true;
    }
    
    const iframeResult = findVideoInIframes();
    if (iframeResult) {
      setupVideo(iframeResult.video);
      return true;
    }
    
    return false;
  }
  
  // 监听页面变化
  function observePageChanges() {
    const observer = new MutationObserver((mutations) => {
      if (!isRunning) return;
      
      let hasNewContent = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
              if (node.tagName === 'VIDEO' || node.querySelector('video') || 
                  node.tagName === 'IFRAME') {
                hasNewContent = true;
                break;
              }
            }
          }
        }
      }
      
      if (hasNewContent) {
        setTimeout(() => handleVideo(), 500);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    return observer;
  }
  
  // 监听URL变化（SPA应用）
  function observeUrlChange() {
    let lastHref = location.href;
    
    const urlObserver = new MutationObserver(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        log('检测到URL变化: ' + lastHref);
        
        if (isRunning) {
          // URL变化后重新检查
          setTimeout(() => {
            if (settings.skipCompleted) {
              checkAndSkip();
            }
            handleVideo();
          }, 1000);
        }
      }
    });
    
    urlObserver.observe(document, { subtree: true, childList: true });
    
    // 也监听popstate事件
    window.addEventListener('popstate', () => {
      if (isRunning) {
        setTimeout(() => {
          if (settings.skipCompleted) {
            checkAndSkip();
          }
          handleVideo();
        }, 1000);
      }
    });
  }
  
  // 视频检测循环
  function startVideoDetection() {
    log('开始检测视频');
    
    // 立即检查一次
    handleVideo();
    
    const checkInterval = setInterval(() => {
      if (!isRunning) {
        clearInterval(checkInterval);
        return;
      }
      
      handleVideo();
      
      // 定期检查URL是否变化
      if (settings.skipCompleted) {
        checkAndSkip();
      }
    }, 3000);
  }
  
  // 模拟人类行为
  function simulateHumanBehavior() {
    if (!isRunning) return;
    
    const x = Math.random() * window.innerWidth;
    const y = Math.random() * window.innerHeight;
    
    const event = new MouseEvent('mousemove', {
      clientX: x,
      clientY: y,
      bubbles: true
    });
    document.dispatchEvent(event);
    
    if (Math.random() > 0.7) {
      window.scrollBy(0, Math.random() * 50 - 25);
    }
    
    setTimeout(() => simulateHumanBehavior(), 30000 + Math.random() * 60000);
  }
  
  // 启动自动播放
  async function startAutoPlay(newSettings) {
    if (isRunning) return;
    
    isRunning = true;
    settings = { ...settings, ...newSettings };
    skipCounter = 0;
    
    log('启动自动播放');
    log('设置: ' + JSON.stringify(settings));
    
    await loadCompletedVideos();
    
    chrome.storage.local.set({ isRunning: true, settings });
    
    // 先检查当前页面是否需要跳过
    if (settings.skipCompleted) {
      const skipped = checkAndSkip();
      if (skipped) {
        log('当前页面已跳过，等待跳转完成');
      }
    }
    
    startVideoDetection();
    videoObserver = observePageChanges();
    observeUrlChange();
    simulateHumanBehavior();
  }
  
  // 停止自动播放
  function stopAutoPlay() {
    isRunning = false;
    skipCounter = 0;
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
  
  // 页面加载时自动启动
  chrome.storage.local.get(['isRunning', 'settings'], (result) => {
    if (result.isRunning) {
      log('检测到之前的运行状态，自动恢复');
      startAutoPlay(result.settings || {});
    }
  });
  
  log('慕课自动刷课助手已加载');
})();