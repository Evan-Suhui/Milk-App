// js/ringtone-ui.js — 来电铃声 UI 绑定

(function() {
  'use strict';

  function initRingtoneUI() {
    const enabledCheckbox = document.getElementById('ringtone-enabled');
    const urlPanel = document.getElementById('ringtone-url-panel');
    const uploadPanel = document.getElementById('ringtone-upload-panel');
    const urlInput = document.getElementById('ringtone-url-input');
    const fileInput = document.getElementById('ringtone-file-input');
    const statusEl = document.getElementById('ringtone-status');
    const resetBtn = document.getElementById('ringtone-reset');
    const urlTestBtn = document.getElementById('ringtone-url-test');
    const uploadTestBtn = document.getElementById('ringtone-upload-test');
    const tabs = document.querySelectorAll('.ringtone-tab');
    const quietEnabled = document.getElementById('quiet-hours-enabled');
    const quietConfig = document.querySelector('.quiet-hours-config');
    const quietStart = document.getElementById('quiet-start-time');
    const quietEnd = document.getElementById('quiet-end-time');
    const fileHint = document.getElementById('ringtone-file-hint');

    if (!enabledCheckbox) return; // 设置面板不存在

    // ---- 初始化状态 ----
    const cfg = RingtoneManager.getConfig();
    enabledCheckbox.checked = cfg.enabled;
    urlInput.value = cfg.url || '';
    quietEnabled.checked = cfg.quietEnabled;
    quietStart.value = cfg.quietStart;
    quietEnd.value = cfg.quietEnd;
    quietConfig.style.display = cfg.quietEnabled ? '' : 'none';
    updateStatus(cfg);

    // 根据来源显示对应面板
    if (cfg.source === 'upload') {
      setActiveTab('upload');
    } else {
      setActiveTab('url');
    }

    // ---- iOS 音频解锁：在用户首次交互时调用 ----
    document.getElementById('ringtone-settings').addEventListener('click', function once() {
      RingtoneManager.unlockAudioOnIOS();
    }, { once: true });

    // ---- 开关 ----
    enabledCheckbox.addEventListener('change', () => {
      RingtoneManager.updateConfig({ enabled: enabledCheckbox.checked });
    });

    // ---- 来源标签切换 ----
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const source = tab.dataset.source;
        setActiveTab(source);
        RingtoneManager.updateConfig({ source });
      });
    });

    function setActiveTab(source) {
      tabs.forEach(t => t.classList.toggle('active', t.dataset.source === source));
      urlPanel.style.display = source === 'url' ? '' : 'none';
      uploadPanel.style.display = source === 'upload' ? '' : 'none';
    }

    // ---- URL 输入 ----
    urlInput.addEventListener('input', () => {
      RingtoneManager.updateConfig({ url: urlInput.value.trim(), source: 'url' });
      updateStatus(RingtoneManager.getConfig());
    });

    // ---- URL 试听 ----
    urlTestBtn.addEventListener('click', async () => {
      const url = urlInput.value.trim();
      if (!url) {
        showToast('请先输入铃声 URL');
        return;
      }
      RingtoneManager.updateConfig({ url, source: 'url' });
      await RingtoneManager.playRingtone();
    });

    // ---- 文件上传 ----
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;

      fileHint.textContent = '处理中...';
      const result = await RingtoneManager.handleFileUpload(file);

      if (result.success) {
        fileHint.textContent = `已上传：${file.name}`;
        uploadTestBtn.style.display = '';
        updateStatus(RingtoneManager.getConfig());
        showToast('铃声已保存');
      } else {
        fileHint.textContent = result.error || '上传失败';
        uploadTestBtn.style.display = 'none';
        showToast(result.error || '上传失败');
      }
    });

    // ---- 上传文件试听 ----
    uploadTestBtn.addEventListener('click', async () => {
      await RingtoneManager.playRingtone();
    });

    // ---- 重置 ----
    resetBtn.addEventListener('click', async () => {
      RingtoneManager.updateConfig({ source: 'default', url: '' });
      urlInput.value = '';
      fileInput.value = '';
      uploadTestBtn.style.display = 'none';
      fileHint.textContent = '支持 MP3 / WAV / M4A / AAC / OGG 格式，文件大小建议不超过 5MB';
      updateStatus(RingtoneManager.getConfig());
      showToast('已重置为默认铃声');
    });

    // ---- 静默时间 ----
    quietEnabled.addEventListener('change', () => {
      quietConfig.style.display = quietEnabled.checked ? '' : 'none';
      RingtoneManager.updateConfig({ quietEnabled: quietEnabled.checked });
    });

    quietStart.addEventListener('change', () => {
      RingtoneManager.updateConfig({ quietStart: quietStart.value });
    });

    quietEnd.addEventListener('change', () => {
      RingtoneManager.updateConfig({ quietEnd: quietEnd.value });
    });

    function updateStatus(cfg) {
      if (cfg.source === 'upload') {
        statusEl.textContent = '当前使用：本地上传的铃声';
      } else if (cfg.source === 'url' && cfg.url) {
        statusEl.textContent = '当前使用：自定义 URL 铃声';
      } else {
        statusEl.textContent = '当前使用：默认铃声';
      }
    }
  }

  // 简易 toast 提示（如果项目中已有可替换）
  function showToast(msg) {
    if (window.showToast) { window.showToast(msg); return; }
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.75);color:#fff;padding:8px 16px;border-radius:6px;font-size:13px;z-index:9999;';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  // 导出初始化函数
  window.initRingtoneUI = initRingtoneUI;
})();
