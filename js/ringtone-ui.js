// js/ringtone-ui.js — 来电铃声 UI 绑定（修复版）

(function () {
  'use strict';
let _ringtoneUIInitialized = false;

  async function initRingtoneUI() {
    if (_ringtoneUIInitialized) return;
    _ringtoneUIInitialized = true;

    // 关键：先让 RingtoneManager 从 localStorage / IndexedDB 恢复配置
    try { await RingtoneManager.init(); } catch (e) { console.warn(e); }

    const enabledCheckbox = document.getElementById('ringtone-enabled');
    const urlPanel = document.getElementById('ringtone-url-panel');
    const uploadPanel = document.getElementById('ringtone-upload-panel');
    const urlInput = document.getElementById('ringtone-url-input');
    const fileInput = document.getElementById('ringtone-file-input');
    const statusEl = document.getElementById('ringtone-status');
    const resetBtn = document.getElementById('ringtone-reset');
    const urlTestBtn = document.getElementById('ringtone-url-test');
    const uploadTestBtn = document.getElementById('ringtone-upload-test');
    const urlSourceBtn = document.getElementById('ringtone-source-url-btn');
    const uploadSourceBtn = document.getElementById('ringtone-source-upload-btn');
    const quietEnabled = document.getElementById('quiet-hours-enabled');
    const quietConfig = document.querySelector('.quiet-hours-config');
    const quietStart = document.getElementById('quiet-start-time');
    const quietEnd = document.getElementById('quiet-end-time');
    const fileHint = document.getElementById('ringtone-file-hint');
    const ringtonePanel = document.getElementById('cs-panel-ringtone');

    if (!enabledCheckbox || !urlSourceBtn || !uploadSourceBtn) return;

    // ---- 初始化状态 ----
    const cfg = RingtoneManager.getConfig();
    enabledCheckbox.checked = cfg.enabled;
    urlInput.value = cfg.url || '';
    quietEnabled.checked = cfg.quietEnabled;
    quietStart.value = cfg.quietStart;
    quietEnd.value = cfg.quietEnd;
    quietConfig.style.display = cfg.quietEnabled ? '' : 'none';
    updateStatus(cfg);
    setActiveTab(cfg.source === 'upload' ? 'upload' : 'url');
    // 恢复上传状态的 UI 显示（刷新后不再看起来像"文件丢失"）
if (cfg.source === 'upload' && cfg.fileName) {
    fileHint.textContent = `已上传：${cfg.fileName}`;
    uploadTestBtn.style.display = '';
}

    // ---- iOS 音频解锁：在用户首次点铃声面板时调用 ----
    // 修复 1：把不存在的 #ringtone-settings 改为真实存在的 #cs-panel-ringtone
    if (ringtonePanel) {
      ringtonePanel.addEventListener('click', function once() {
        try { RingtoneManager.unlockAudioOnIOS(); } catch (_) {}
      }, { once: true });
    }

    // ---- 来电铃声总开关 ----
    enabledCheckbox.addEventListener('change', () => {
      RingtoneManager.updateConfig({ enabled: enabledCheckbox.checked });
    });

    // ---- 来源切换（修复 2：用 id 绑定真实按钮） ----
    urlSourceBtn.addEventListener('click', () => {
      setActiveTab('url');
      RingtoneManager.updateConfig({ source: 'url' });
      updateStatus(RingtoneManager.getConfig());
    });
    uploadSourceBtn.addEventListener('click', () => {
      setActiveTab('upload');
      RingtoneManager.updateConfig({ source: 'upload' });
      updateStatus(RingtoneManager.getConfig());
    });

    function setActiveTab(source) {
      const isUrl = source === 'url';
      urlPanel.style.display = isUrl ? '' : 'none';
      uploadPanel.style.display = isUrl ? 'none' : '';

      urlSourceBtn.classList.toggle('modal-btn-primary', isUrl);
      urlSourceBtn.classList.toggle('modal-btn-secondary', !isUrl);
      uploadSourceBtn.classList.toggle('modal-btn-primary', !isUrl);
      uploadSourceBtn.classList.toggle('modal-btn-secondary', isUrl);
    }

    // ---- URL 输入：只更新草稿，不写入 config ----
    // 修复 3：输入不再直接 updateConfig，避免"边打字边保存"
    // 只在用户切换 tab / 关闭面板时才落盘（这里简化：输入时更新内存，change 时落盘）
    let _urlSaveTimer = null;
urlInput.addEventListener('input', () => {
  clearTimeout(_urlSaveTimer);
  _urlSaveTimer = setTimeout(() => {
    RingtoneManager.updateConfig({ url: urlInput.value.trim(), source: 'url' });
    updateStatus(RingtoneManager.getConfig());
  }, 400); // 停止输入 400ms 后落盘
});
urlInput.addEventListener('blur', () => {
  clearTimeout(_urlSaveTimer);
  RingtoneManager.updateConfig({ url: urlInput.value.trim(), source: 'url' });
  updateStatus(RingtoneManager.getConfig());
});
    // ---- URL 试听（修复 4：用 previewAudio，不改 config） ----
    urlTestBtn.addEventListener('click', async () => {
      const url = urlInput.value.trim();
      if (!url) { showToast('请先输入铃声 URL'); return; }
      const result = await RingtoneManager.previewAudio(url);
      if (!result.success) showToast(result.error || '试听失败');
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

    // ---- 上传试听（修复 5：播放刚上传的 blob，不再走 playRingtone） ----
    uploadTestBtn.addEventListener('click', async () => {
      const blobUrl = RingtoneManager.getUploadedUrl();
      if (!blobUrl) { showToast('请先上传音频文件'); return; }
      const result = await RingtoneManager.previewAudio(blobUrl);
      if (!result.success) showToast(result.error || '试听失败');
    });

    // ---- 重置 ----
    resetBtn.addEventListener('click', async () => {
      RingtoneManager.updateConfig({ source: 'default', url: '' , fileName: ''});
      urlInput.value = '';
      fileInput.value = '';
      uploadTestBtn.style.display = 'none';
      fileHint.textContent = '支持 MP3 / WAV / M4A / AAC / OGG 格式，建议不超过 5MB';
      updateStatus(RingtoneManager.getConfig());
      showToast('已重置为默认铃声');
    });

    // ---- 静默时间段（修复 6：确保配置容器正确显示/隐藏） ----
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

  function showToast(msg) {
    if (window.showToast) { window.showToast(msg); return; }
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.75);color:#fff;padding:8px 16px;border-radius:6px;font-size:13px;z-index:9999;';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  // 导出 + 自动初始化（修复 7：不再依赖外部调用）
  window.initRingtoneUI = initRingtoneUI;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRingtoneUI);
  } else {
    // DOM 已就绪时直接执行
    initRingtoneUI();
  }
})();

// 兜底：点击来电弹窗里任意按钮时停止铃声
document.addEventListener('click', function (e) {
  var btn = e.target.closest('#call-incoming-overlay button, #call-incoming-overlay [onclick]');
  if (!btn) return;
  try {
    if (window.RingtoneManager) RingtoneManager.stopRingtone();
  } catch (err) {}
}, true);
