document.addEventListener('DOMContentLoaded', function() {
  var startBtn = document.getElementById('startBtn');
  var clearBtn = document.getElementById('clearBtn');
  var statusDot = document.getElementById('statusDot');
  var statusText = document.getElementById('statusText');
  var autoPlay = document.getElementById('autoPlay');
  var autoNext = document.getElementById('autoNext');
  var skipCompleted = document.getElementById('skipCompleted');
  var muteVideo = document.getElementById('muteVideo');
  var playbackRate = document.getElementById('playbackRate');
  var switchDelay = document.getElementById('switchDelay');
  var completedCount = document.getElementById('completedCount');
  var runTime = document.getElementById('runTime');
  
  var isRunning = false;
  var startTime = null;
  var timerInterval = null;
  
  // 加载设置
  chrome.storage.local.get([
    'autoPlay', 'autoNext', 'skipCompleted', 'muteVideo', 'playbackRate', 'switchDelay',
    'isRunning', 'completedCount', 'startTime'
  ], function(saved) {
    if (chrome.runtime.lastError) return;
    
    autoPlay.checked = saved.autoPlay !== false;
    autoNext.checked = saved.autoNext !== false;
    skipCompleted.checked = saved.skipCompleted !== false;
    muteVideo.checked = saved.muteVideo || false;
    playbackRate.value = saved.playbackRate || 1;
    switchDelay.value = saved.switchDelay || 3;
    
    if (saved.isRunning) {
      isRunning = true;
      startTime = saved.startTime || Date.now();
      updateUI(true);
      startTimer();
    }
    
    if (saved.completedCount) {
      completedCount.textContent = saved.completedCount;
    }
  });
  
  // 保存设置
  function saveSettings() {
    try {
      chrome.storage.local.set({
        autoPlay: autoPlay.checked,
        autoNext: autoNext.checked,
        skipCompleted: skipCompleted.checked,
        muteVideo: muteVideo.checked,
        playbackRate: parseFloat(playbackRate.value),
        switchDelay: parseInt(switchDelay.value)
      });
    } catch (e) {}
  }
  
  // 更新UI
  function updateUI(running) {
    if (running) {
      statusDot.classList.add('active');
      statusText.textContent = '运行中';
      startBtn.textContent = '停止刷课';
      startBtn.className = 'btn btn-stop';
    } else {
      statusDot.classList.remove('active');
      statusText.textContent = '未运行';
      startBtn.textContent = '开始刷课';
      startBtn.className = 'btn btn-start';
    }
  }
  
  // 计时器
  function startTimer() {
    timerInterval = setInterval(function() {
      if (startTime) {
        var minutes = Math.floor((Date.now() - startTime) / 60000);
        runTime.textContent = minutes;
      }
    }, 1000);
  }
  
  // 发送消息给content script
  function sendMessageToTab(msg) {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs && tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, msg, function(response) {
            if (chrome.runtime.lastError) {
              console.log('Message send error (expected if content script not loaded)');
            }
          });
        }
      });
    } catch (e) {}
  }
  
  // 监听消息
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    try {
      if (message.type === 'videoCompleted') {
        var count = parseInt(completedCount.textContent) + 1;
        completedCount.textContent = count;
        chrome.storage.local.set({ completedCount: count });
      }
    } catch (e) {}
    sendResponse({ received: true });
    return true;
  });
  
  // 开始/停止按钮
  startBtn.addEventListener('click', function() {
    isRunning = !isRunning;
    
    if (isRunning) {
      startTime = Date.now();
      chrome.storage.local.set({ isRunning: true, startTime: startTime });
      startTimer();
      
      sendMessageToTab({
        type: 'startAutoPlay',
        settings: {
          autoPlay: autoPlay.checked,
          autoNext: autoNext.checked,
          skipCompleted: skipCompleted.checked,
          muteVideo: muteVideo.checked,
          playbackRate: parseFloat(playbackRate.value),
          switchDelay: parseInt(switchDelay.value)
        }
      });
    } else {
      if (timerInterval) clearInterval(timerInterval);
      chrome.storage.local.set({ isRunning: false });
      
      sendMessageToTab({ type: 'stopAutoPlay' });
    }
    
    updateUI(isRunning);
    saveSettings();
  });
  
  // 设置变更保存
  var checkboxes = [autoPlay, autoNext, skipCompleted, muteVideo];
  for (var i = 0; i < checkboxes.length; i++) {
    checkboxes[i].addEventListener('change', saveSettings);
  }
  
  var inputs = [playbackRate, switchDelay];
  for (var j = 0; j < inputs.length; j++) {
    inputs[j].addEventListener('change', saveSettings);
  }
  
  // 清除记录
  clearBtn.addEventListener('click', function() {
    if (confirm('确定要清除所有播放记录吗？')) {
      chrome.storage.local.set({ completedVideos: [] }, function() {
        alert('播放记录已清除');
      });
    }
  });
});