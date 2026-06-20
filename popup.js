document.addEventListener('DOMContentLoaded', async () => {
  const startBtn = document.getElementById('startBtn');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const autoPlay = document.getElementById('autoPlay');
  const autoNext = document.getElementById('autoNext');
  const skipCompleted = document.getElementById('skipCompleted');
  const muteVideo = document.getElementById('muteVideo');
  const playbackRate = document.getElementById('playbackRate');
  const switchDelay = document.getElementById('switchDelay');
  const completedCount = document.getElementById('completedCount');
  const runTime = document.getElementById('runTime');
  
  let isRunning = false;
  let startTime = null;
  let timerInterval = null;
  
  // 加载保存的设置
  const saved = await chrome.storage.local.get([
    'autoPlay', 'autoNext', 'skipCompleted', 'muteVideo', 'playbackRate', 'switchDelay',
    'isRunning', 'completedCount', 'startTime'
  ]);
  
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
  
  // 保存设置
  function saveSettings() {
    chrome.storage.local.set({
      autoPlay: autoPlay.checked,
      autoNext: autoNext.checked,
      skipCompleted: skipCompleted.checked,
      muteVideo: muteVideo.checked,
      playbackRate: parseFloat(playbackRate.value),
      switchDelay: parseInt(switchDelay.value)
    });
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
  
  // 启动计时器
  function startTimer() {
    timerInterval = setInterval(() => {
      if (startTime) {
        const minutes = Math.floor((Date.now() - startTime) / 60000);
        runTime.textContent = minutes;
      }
    }, 1000);
  }
  
  // 监听来自content script的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'videoCompleted') {
      const count = parseInt(completedCount.textContent) + 1;
      completedCount.textContent = count;
      chrome.storage.local.set({ completedCount: count });
    }
  });
  
  // 开始/停止按钮
  startBtn.addEventListener('click', async () => {
    isRunning = !isRunning;
    
    if (isRunning) {
      startTime = Date.now();
      chrome.storage.local.set({ isRunning: true, startTime });
      startTimer();
      
      // 发送消息给content script开始工作
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, {
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
      }
    } else {
      clearInterval(timerInterval);
      chrome.storage.local.set({ isRunning: false });
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { type: 'stopAutoPlay' });
      }
    }
    
    updateUI(isRunning);
    saveSettings();
  });
  
  // 设置变更时保存
  [autoPlay, autoNext, skipCompleted, muteVideo].forEach(el => {
    el.addEventListener('change', saveSettings);
  });
  
  [playbackRate, switchDelay].forEach(el => {
    el.addEventListener('change', saveSettings);
  });
});