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
    try {
      console.log('[慕课助手] ' + msg);
    } catch (e) {}
  }
  
  // 获取页面唯一标识
  function getPageId() {
    try {
      return window.location.href.split('?')[0].split('#')[0];
    } catch (e) {
      return Date.now().toString();
    }
  }
  
  // 加载已完成视频
  function loadCompletedVideos() {
    try {
      chrome.storage.local.get(['completedVideos'], function(result) {
        if (chrome.runtime.lastError) {
          log('存储读取错误');
          return;
        }
        if (result && result.completedVideos) {
          completedVideos = new Set(result.completedVideos);
          log('已加载 ' + completedVideos.size + ' 个已完成视频');
        }
      });
    } catch (e) {
      log('加载失败');
    }
  }
  
  // 保存已完成视频
  function saveCompleted() {
    try {
      var pageId = getPageId();
      completedVideos.add(pageId);
      var arr = Array.from(completedVideos);
      chrome.storage.local.set({ completedVideos: arr }, function() {
        if (chrome.runtime.lastError) {
          log('存储写入错误');
        } else {
          log('已保存: ' + pageId);
        }
      });
    } catch (e) {
      log('保存失败');
    }
  }
  
  // 通知完成
  function notifyCompleted() {
    try {
      chrome.runtime.sendMessage({ type: 'videoCompleted' }, function(response) {
        if (chrome.runtime.lastError) {
          // 忽略错误
        }
      });
    } catch (e) {}
  }
  
  // 检查是否已完成
  function isCompleted() {
    try {
      return completedVideos.has(getPageId());
    } catch (e) {
      return false;
    }
  }
  
  // 查找视频
  function findVideo() {
    try {
      // 查找iframe内的视频
      var iframes = document.querySelectorAll('iframe');
      for (var i = 0; i < iframes.length; i++) {
        try {
          var doc = iframes[i].contentDocument || iframes[i].contentWindow.document;
          var v = doc.querySelector('video');
          if (v) return v;
        } catch (e) {}
      }
      // 查找页面视频
      return document.querySelector('video');
    } catch (e) {
      return null;
    }
  }
  
  // 点击下一个课程
  function clickNext() {
    log('尝试切换下一集...');
    
    try {
      // 方法1: 查找课程列表中的下一个项
      var items = document.querySelectorAll('li, .item, [class*="lesson"], [class*="chapter"]');
      var foundActive = false;
      
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var isActive = item.classList.contains('active') || 
                       item.classList.contains('current') || 
                       item.classList.contains('selected');
        
        if (isActive) {
          foundActive = true;
          continue;
        }
        
        if (foundActive) {
          var link = item.querySelector('a');
          if (link && link.href) {
            log('点击下一个课程项');
            link.click();
            return true;
          }
        }
      }
      
      // 方法2: 查找下一集按钮
      var nextTexts = ['下一集', '下一个', '下一课', '下一节', '下一章'];
      var allEls = document.querySelectorAll('a, button, span, div');
      
      for (var j = 0; j < allEls.length; j++) {
        var el = allEls[j];
        var text = (el.textContent || '').trim();
        for (var k = 0; k < nextTexts.length; k++) {
          if (text === nextTexts[k] || text.indexOf(nextTexts[k]) !== -1) {
            log('点击下一集按钮');
            el.click();
            return true;
          }
        }
      }
      
      // 方法3: 类名查找
      var nextEl = document.querySelector('.next, .btn-next, .next-btn, [class*="next"]');
      if (nextEl) {
        log('点击next元素');
        nextEl.click();
        return true;
      }
      
    } catch (e) {
      log('点击失败');
    }
    
    log('未找到下一集');
    return false;
  }
  
  // 设置视频
  function setupVideo(video) {
    if (!video || video.dataset.setupDone) return;
    video.dataset.setupDone = '1';
    
    log('设置视频');
    
    try {
      if (settings.muteVideo) {
        video.muted = true;
      }
      video.playbackRate = settings.playbackRate;
    } catch (e) {}
    
    // 视频结束
    video.addEventListener('ended', function() {
      if (!isRunning) return;
      log('视频播放结束');
      saveCompleted();
      notifyCompleted();
      
      if (settings.autoNext) {
        setTimeout(function() { clickNext(); }, settings.switchDelay * 1000);
      }
    });
    
    // 进度95%标记完成
    video.addEventListener('timeupdate', function() {
      if (!isRunning || !video.duration) return;
      if (video.currentTime / video.duration > 0.95 && !video.dataset.marked) {
        video.dataset.marked = '1';
        log('进度95%+，标记完成');
        saveCompleted();
      }
    });
    
    // 防止暂停
    video.addEventListener('pause', function() {
      if (isRunning && !video.ended && video.readyState > 2) {
        setTimeout(function() { 
          video.play().catch(function() {}); 
        }, 1000);
      }
    });
    
    // 自动播放
    if (settings.autoPlay) {
      video.play().catch(function() {
        video.muted = true;
        video.play().catch(function() {});
      });
    }
  }
  
  // 检查跳过
  function checkSkip() {
    if (!isRunning || !settings.skipCompleted) return;
    
    var currentUrl = window.location.href;
    if (currentUrl === lastProcessedUrl) return;
    lastProcessedUrl = currentUrl;
    
    var pageId = getPageId();
    
    if (completedVideos.has(pageId)) {
      skipCount++;
      log('视频已看过，跳过 #' + skipCount);
      
      if (skipCount > 50) {
        log('跳过次数过多，停止');
        return;
      }
      
      setTimeout(function() { clickNext(); }, 800);
    } else {
      skipCount = 0;
    }
  }
  
  // 主循环
  function mainLoop() {
    if (!isRunning) return;
    checkSkip();
    var video = findVideo();
    if (video) setupVideo(video);
  }
  
  // 监听URL变化
  function watchUrl() {
    var url = location.href;
    
    setInterval(function() {
      if (location.href !== url) {
        url = location.href;
        log('URL变化');
        
        // 重置视频标记
        var video = findVideo();
        if (video) {
          delete video.dataset.setupDone;
          delete video.dataset.marked;
        }
        
        setTimeout(function() {
          checkSkip();
          var v = findVideo();
          if (v) setupVideo(v);
        }, 1500);
      }
    }, 500);
  }
  
  // 模拟人类行为
  function simulateHuman() {
    setInterval(function() {
      if (!isRunning) return;
      try {
        document.dispatchEvent(new MouseEvent('mousemove', {
          clientX: Math.random() * window.innerWidth,
          clientY: Math.random() * window.innerHeight,
          bubbles: true
        }));
      } catch (e) {}
    }, 30000 + Math.random() * 60000);
  }
  
  // 启动
  function start(newSettings) {
    if (isRunning) return;
    isRunning = true;
    settings = Object.assign({}, settings, newSettings);
    skipCount = 0;
    
    log('启动');
    loadCompletedVideos();
    
    chrome.storage.local.set({ isRunning: true, settings: settings });
    
    // 立即检查
    checkSkip();
    
    // 主循环
    setInterval(mainLoop, 3000);
    
    // URL监听
    watchUrl();
    
    // 模拟人类
    simulateHuman();
  }
  
  // 停止
  function stop() {
    isRunning = false;
    skipCount = 0;
    log('停止');
    chrome.storage.local.set({ isRunning: false });
  }
  
  // 监听消息
  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    try {
      if (msg.type === 'startAutoPlay') {
        start(msg.settings);
        sendResponse({ success: true });
      } else if (msg.type === 'stopAutoPlay') {
        stop();
        sendResponse({ success: true });
      }
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true;
  });
  
  // 自动恢复
  chrome.storage.local.get(['isRunning', 'settings'], function(result) {
    if (chrome.runtime.lastError) return;
    if (result && result.isRunning) {
      log('自动恢复运行');
      start(result.settings || {});
    }
  });
  
  log('慕课助手已加载');
})();