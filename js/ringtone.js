// js/ringtone.js — 来电铃声管理模块

const RingtoneManager = (() => {
  'use strict';

  const STORAGE_KEY = 'milk_ringtone_config';
  const DB_NAME = 'milk_ringtone_db';
  const DB_VERSION = 1;
  const STORE_NAME = 'audio_files';

  // 默认配置
  let config = {
    enabled: true,
    source: 'url',          // 'url' | 'upload' | 'default'
    url: '',
    quietEnabled: false,
    quietStart: '22:00',
    quietEnd: '07:00'
  };

  let audioElement = null;   // 用于播放铃声的 <audio> 元素
  let currentBlobUrl = null; // 本地上传文件的 Blob URL
  let audioCtx = null;       // Web Audio API 上下文（iOS 解锁用）

  // ==================== 配置读写 ====================

  function loadConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        config = Object.assign(config, JSON.parse(saved));
      }
    } catch (e) {
      console.warn('[Ringtone] 配置加载失败:', e);
    }
    return config;
  }

  function saveConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.warn('[Ringtone] 配置保存失败:', e);
    }
  }

  function getConfig() {
    return { ...config };
  }

  function updateConfig(partial) {
    Object.assign(config, partial);
    saveConfig();
  }

  // ==================== IndexedDB 存储上传文件 ====================

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveAudioBlob(arrayBuffer, mimeType) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ buffer: arrayBuffer, type: mimeType }, 'custom_ringtone');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadAudioBlob() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get('custom_ringtone');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteAudioBlob() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete('custom_ringtone');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * 注意：iOS WebKit 将 Blob 存储在 IndexedDB 中时可能被系统回收，
   * 导致后续读取时抛出 NotFoundError[reference:3]。
   * 因此我们存储 ArrayBuffer 而非 Blob，播放时重新创建 Blob URL。
   */
  async function restoreUploadedRingtone() {
    if (config.source !== 'upload') return;
    try {
      const data = await loadAudioBlob();
      if (data && data.buffer) {
        const blob = new Blob([data.buffer], { type: data.type || 'audio/mpeg' });
        if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = URL.createObjectURL(blob);
      }
    } catch (e) {
      console.warn('[Ringtone] 恢复上传铃声失败:', e);
    }
  }

  // ==================== 音频播放 ====================

  /**
   * iOS Safari 要求 AudioContext 必须在用户手势中创建或 resume[reference:4]。
   * 此函数应在用户首次点击设置面板时调用。
   */
  function unlockAudioOnIOS() {
    if (audioCtx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioCtx = new AudioCtx();
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
      }
    } catch (e) {
      console.warn('[Ringtone] AudioContext 初始化失败:', e);
    }
  }

  function getAudioElement() {
    if (!audioElement) {
      audioElement = new Audio();
      audioElement.preload = 'auto';
      audioElement.loop = false; // 铃声不循环，来电时播放一次或由调用方控制
    }
    return audioElement;
  }

  /**
   * 获取当前铃声的播放源
   */
  function resolveSource() {
    if (config.source === 'upload' && currentBlobUrl) {
      return currentBlobUrl;
    }
    if (config.source === 'url' && config.url) {
      return config.url;
    }
    return null; // 使用默认铃声
  }

  /**
   * 播放来电铃声
   * @returns {Promise<boolean>} 是否成功播放
   */
  async function playRingtone() {
    if (!config.enabled) return false;
    if (isQuietHours()) return false;

    // 尝试解锁 iOS 音频上下文
    unlockAudioOnIOS();

    const src = resolveSource();
    const audio = getAudioElement();

    if (src) {
      // 自定义铃声
      audio.src = src;
    } else {
      // 默认铃声（使用 Web Audio API 生成简单的三音提示）
      return playDefaultTone();
    }

    try {
      audio.currentTime = 0;
      await audio.play();
      return true;
    } catch (e) {
      console.warn('[Ringtone] 播放失败（可能被浏览器自动播放策略阻止）:', e);
      // 降级到默认提示音
      return playDefaultTone();
    }
  }

  function stopRingtone() {
    const audio = getAudioElement();
    audio.pause();
    audio.currentTime = 0;
  }

  /**
   * 使用 Web Audio API 生成默认提示音
   * 这种方式在 iOS 上更可靠，且不依赖外部文件[reference:5]
   */
  function playDefaultTone() {
    unlockAudioOnIOS();
    if (!audioCtx) return false;

    try {
      const now = audioCtx.currentTime;
      // 三声短促的提示音
      [0, 0.25, 0.5].forEach((offset, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.type = 'sine';
        osc.frequency.value = 880; // A5

        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(0.3, now + offset + 0.01);
        gain.gain.linearRampToValueAtTime(0, now + offset + 0.15);

        osc.start(now + offset);
        osc.stop(now + offset + 0.2);
      });
      return true;
    } catch (e) {
      console.warn('[Ringtone] 默认提示音播放失败:', e);
      return false;
    }
  }

  // ==================== 静默时间判断 ====================

  /**
   * 判断当前是否在静默时间段内
   * 支持跨天场景（如 22:00 - 07:00）
   */
  function isQuietHours() {
    if (!config.quietEnabled) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = config.quietStart.split(':').map(Number);
    const [endH, endM] = config.quietEnd.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      // 不跨天：如 09:00 - 18:00
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // 跨天：如 22:00 - 07:00
      // 当前时间 >= 开始时间 或 当前时间 < 结束时间[reference:6]
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  }

  // ==================== 文件上传处理 ====================

  /**
   * 处理用户上传的本地音频文件
   * @param {File} file
   */
  async function handleFileUpload(file) {
    if (!file) return { success: false, error: '未选择文件' };

    // 校验文件类型
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/webm'];
    const ext = file.name.split('.').pop().toLowerCase();
    const validExts = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'webm'];
    if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
      return { success: false, error: '不支持的音频格式，请使用 MP3 / WAV / M4A / AAC / OGG' };
    }

    // 大小限制 5MB
    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: '文件过大，请使用 5MB 以内的音频文件' };
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      await saveAudioBlob(arrayBuffer, file.type || 'audio/mpeg');

      // 创建 Blob URL 用于试听和播放[reference:7]
      if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
      const blob = new Blob([arrayBuffer], { type: file.type || 'audio/mpeg' });
      currentBlobUrl = URL.createObjectURL(blob);

      config.source = 'upload';
      saveConfig();

      return { success: true };
    } catch (e) {
      console.error('[Ringtone] 文件保存失败:', e);
      return { success: false, error: '文件保存失败，请重试' };
    }
  }

  // ==================== 初始化 ====================

  async function init() {
    loadConfig();
    if (config.source === 'upload') {
      await restoreUploadedRingtone();
    }
    console.log('[Ringtone] 模块已初始化');
  }

  return {
    init,
    getConfig,
    updateConfig,
    playRingtone,
    stopRingtone,
    isQuietHours,
    handleFileUpload,
    unlockAudioOnIOS,
    restoreUploadedRingtone
  };
})();
