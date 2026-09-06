// ==UserScript==
// @name         虎牙直播主播屏蔽器 (按房间号/链接/主播名)
// @namespace    https://github.com/guodonglu/huya-streamer-blocker
// @version      1.3.1
// @description  输入房间号、直播间链接或主播名一键屏蔽虎牙主播。仅在列表页展示悬浮管理标签（详情页不打扰），全站列表卡片彻底隐藏（直接看不到），误入已屏蔽直播间自动拦截静音，卡片悬停一键快捷屏蔽。独立作用域样式，绝不与其它插件冲突。
// @author       guodonglu
// @match        *://*.huya.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ================= 1. 存储与配置管理 =================
  const STORAGE_KEY_LIST = 'hy_blocked_streamers_v1';
  const STORAGE_KEY_CONFIG = 'hy_blocker_config_v1';

  const DEFAULT_CONFIG = {
    showFloatBtn: true,     // 是否在列表页显示右侧悬浮入口
    showQuickBtn: true,     // 是否在卡片右上角显示快捷屏蔽图标
    autoRedirect: false,    // 进入被屏蔽直播间时是否直接返回首页 (默认弹出拦截提示)
  };

  function getStorage(key, defaultVal) {
    try {
      if (typeof GM_getValue === 'function') {
        return GM_getValue(key, defaultVal);
      }
    } catch (e) {}
    try {
      const v = localStorage.getItem(key);
      return v !== null ? JSON.parse(v) : defaultVal;
    } catch (e) {
      return defaultVal;
    }
  }

  function setStorage(key, val) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, val);
        return;
      }
    } catch (e) {}
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
  }

  const rawList = getStorage(STORAGE_KEY_LIST, []);
  let blockedList = (Array.isArray(rawList) ? rawList : []).filter(item => {
    return item && typeof item.id === 'string' && item.id.trim().length > 0;
  });
  let config = Object.assign({}, DEFAULT_CONFIG, getStorage(STORAGE_KEY_CONFIG, {}));

  // 虎牙保留路径与公共列表模块名 (用于区分列表页与直播详情页)
  const RESERVED_PATHS = new Set([
    'g', 'l', 'm', 'video', 'search', 'myfollow', 'udb', 'pay', 'hd', 
    'news', 'download', 'help', 'act', 'show', 'game', 'all', 'app', 'e', 'special'
  ]);

  /**
   * 判断当前是否为直播间详情页 (如 huya.com/229085 或 huya.com/kpl)
   */
  function isRoomDetailPage() {
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (!path) return false; // 首页为列表页
    const firstSeg = path.split('/')[0].toLowerCase();
    return !RESERVED_PATHS.has(firstSeg);
  }

  function saveList() {
    blockedList = (blockedList || []).filter(item => item && typeof item.id === 'string' && item.id.trim().length > 0);
    setStorage(STORAGE_KEY_LIST, blockedList);
    applyFilter();
    updateUIList();
  }

  function saveConfig() {
    setStorage(STORAGE_KEY_CONFIG, config);
    updateFloatButtonVisibility();
  }

  // 解析用户输入（支持纯数字房间号、完整URL、个性域名或主播名）
  function parseInput(input) {
    if (!input) return null;
    let s = input.trim();
    // 检查是否为链接形式，如 https://www.huya.com/229085 或 huya.com/kpl
    const urlMatch = s.match(/(?:huya\.com\/|^|\/)([a-zA-Z0-9_\u4e00-\u9fa5-]+)(?:\?|#|$|\/)/i);
    if (urlMatch && urlMatch[1]) {
      const slug = urlMatch[1].toLowerCase();
      if (!RESERVED_PATHS.has(slug)) {
        return slug;
      }
    }
    // 去除头尾标点符号，保留中文、字母、数字、下划线、减号
    s = s.replace(/^[^\w\u4e00-\u9fa5]+|[^\w\u4e00-\u9fa5]+$/gu, '').toLowerCase();
    return s && !RESERVED_PATHS.has(s) ? s : null;
  }

  function addBlockedItem(rawInput, remark = '') {
    const id = parseInput(rawInput);
    if (!id) return { success: false, msg: '输入内容格式不正确' };

    const exists = blockedList.some(item => (item.id || '').toLowerCase() === id);
    if (exists) return { success: false, msg: `[${id}] 已在屏蔽列表中` };

    const dateStr = new Date().toLocaleDateString();
    blockedList.unshift({
      id: id,
      remark: (remark || '').trim(),
      date: dateStr
    });
    saveList();
    return { success: true, id };
  }

  function removeBlockedItem(id) {
    id = (id || '').toLowerCase();
    blockedList = blockedList.filter(item => (item.id || '').toLowerCase() !== id);
    saveList();
  }

  // ================= 2. 核心特征提取与匹配算法 =================

  /**
   * 从列表卡片 DOM 中全面提取特征信息：
   * 包含：解码 data-url 中的房间号、href、uid、data-lp 以及主播昵称 (.nick)
   */
  function getCardInfo(card) {
    let roomId = null;
    let uid = null;
    let nick = null;

    // 1. 检查卡片容器自身属性 (data-rid, data-lp, data-uid)
    if (card.dataset) {
      if (card.dataset.rid) roomId = card.dataset.rid.toLowerCase();
      if (card.dataset.lp) uid = card.dataset.lp.toLowerCase();
      if (card.dataset.uid) uid = card.dataset.uid.toLowerCase();
    }
    if (!uid && card.getAttribute('data-lp')) {
      uid = card.getAttribute('data-lp').toLowerCase();
    }

    // 2. 检查卡片内所有的链接与带有 data-url / href 的元素
    // 虎牙分类与全部列表页最核心：<a data-url="http%3A%2F%2Fwww.huya.com%2F229085" ...>
    const elements = card.querySelectorAll('a, [data-url], [data-href], [data-uid]');
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];

      if (!uid && el.getAttribute('data-uid')) {
        uid = el.getAttribute('data-uid').toLowerCase();
      }

      // 提取 data-url
      const rawDataUrl = el.getAttribute('data-url') || el.getAttribute('data-href');
      if (rawDataUrl && !roomId) {
        try {
          const decoded = decodeURIComponent(rawDataUrl);
          const m = decoded.match(/(?:huya\.com\/|^|\/)([a-zA-Z0-9_-]+)(?:\?|#|$)/i);
          if (m && m[1]) {
            const slug = m[1].toLowerCase();
            if (!RESERVED_PATHS.has(slug)) {
              roomId = slug;
            }
          }
        } catch (e) {}
      }

      // 提取 href
      const href = el.getAttribute('href');
      if (href && !roomId) {
        const m = href.match(/(?:huya\.com\/|^|\/)([a-zA-Z0-9_-]+)(?:\?|#|$)/i);
        if (m && m[1]) {
          const slug = m[1].toLowerCase();
          if (!RESERVED_PATHS.has(slug)) {
            roomId = slug;
          }
        }
      }
    }

    // 3. 提取主播昵称
    const nickEl = card.querySelector('.nick, i.nick, .avatar-name, .txt .nick');
    if (nickEl) {
      nick = (nickEl.innerText || nickEl.getAttribute('title') || '').trim();
    }

    return { roomId, uid, nick };
  }

  /**
   * 判断卡片是否匹配被屏蔽名单
   */
  function isCardBlocked(info) {
    if (!info || blockedList.length === 0) return false;

    const cardRoomId = (info.roomId || '').toLowerCase();
    const cardUid = (info.uid || '').toLowerCase();
    const cardNick = (info.nick || '').toLowerCase();

    for (const item of blockedList) {
      const target = (item.id || '').toLowerCase().trim();
      if (!target) continue;

      // 1. 房间号/域名完全匹配
      if (cardRoomId && cardRoomId === target) return true;

      // 2. UID 完全匹配
      if (cardUid && cardUid === target) return true;

      // 3. 主播昵称完全匹配
      if (cardNick && cardNick === target) return true;

      // 4. 主播名包含匹配 (如果屏蔽关键词长度 >= 2，且不是纯数字，支持模糊匹配昵称，如 "红莲" 匹配 "红莲8888")
      const isPureDigits = /^\d+$/.test(target);
      if (!isPureDigits && target.length >= 2 && cardNick.includes(target)) {
        return true;
      }
    }
    return false;
  }

  // ================= 3. 列表页实时过滤隐藏 =================

  let filteredCount = 0;

  function applyFilter() {
    if (blockedList.length === 0) {
      document.querySelectorAll('[data-hy-blocked="true"]').forEach(el => {
        el.removeAttribute('data-hy-blocked');
        el.style.display = '';
      });
      filteredCount = 0;
      updateCounterBadge();
      if (!config.showQuickBtn) return;
    }

    // 常见卡片选择器覆盖
    const cardSelectors = [
      '.game-live-item',
      '.live-card',
      '.video-info-wrap',
      '.recommend-item',
      '.mod-index-rec li',
      '.match-item',
      '.search-result li',
      '#js-live-list > li',
      '.live-list > li',
      '.index-list-item',
      'li[data-lp]'
    ].join(',');

    const cards = document.querySelectorAll(cardSelectors);
    let count = 0;

    cards.forEach(card => {
      const info = getCardInfo(card);
      const shouldBlock = isCardBlocked(info);

      if (shouldBlock) {
        // 直接彻底隐藏该卡片，后面的卡片自然补齐
        card.setAttribute('data-hy-blocked', 'true');
        card.style.setProperty('display', 'none', 'important');
        count++;
      } else if (card.getAttribute('data-hy-blocked') === 'true') {
        card.removeAttribute('data-hy-blocked');
        card.style.display = '';
      }

      // 为未屏蔽卡片注入快捷屏蔽按钮
      if (config.showQuickBtn && !shouldBlock && !card.querySelector('.hy-quick-block-btn')) {
        injectQuickBlockBtn(card, info);
      }
    });

    // 兜底补漏：检索带有匹配 data-url / href 的未隐藏元素
    const links = document.querySelectorAll('[data-url], a[href*="huya.com/"], a[href^="/"]');
    links.forEach(el => {
      const raw = el.getAttribute('data-url') || el.getAttribute('href') || '';
      try {
        const decoded = decodeURIComponent(raw);
        for (const item of blockedList) {
          const target = (item.id || '').toLowerCase();
          if (target && decoded.toLowerCase().includes(target)) {
            const parentCard = el.closest('li, .game-live-item, .live-card, [class*="item"]');
            if (parentCard && parentCard.getAttribute('data-hy-blocked') !== 'true') {
              parentCard.setAttribute('data-hy-blocked', 'true');
              parentCard.style.setProperty('display', 'none', 'important');
              count++;
            }
          }
        }
      } catch (e) {}
    });

    filteredCount = count;
    updateCounterBadge();
  }

  // 注入卡片悬停快捷“🚫 屏蔽”按钮
  function injectQuickBlockBtn(card, info) {
    if (card.querySelector('.hy-quick-block-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'hy-quick-block-btn';
    btn.title = `一键屏蔽此主播 (${info.nick || info.roomId || ''})`;
    btn.innerHTML = '🚫 屏蔽';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const blockTarget = info.roomId || info.nick;
      if (!blockTarget) return;

      const res = addBlockedItem(blockTarget, info.nick || '');
      if (res.success) {
        showToast(`已屏蔽：${info.nick || blockTarget}`, 'success');
        card.setAttribute('data-hy-blocked', 'true');
        card.style.setProperty('display', 'none', 'important');
      } else {
        showToast(res.msg, 'info');
      }
    });

    const pos = window.getComputedStyle(card).position;
    if (pos === 'static') {
      card.style.position = 'relative';
    }
    card.appendChild(btn);
  }

  // 防抖动态监听 DOM 变化
  let filterTimer = null;
  function debounceFilter() {
    if (filterTimer) clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      applyFilter();
    }, 80);
  }

  const observer = new MutationObserver(() => {
    debounceFilter();
  });

  // ================= 4. 直播详情页误入拦截 =================

  function getCurrentRoomSlug() {
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (!path) return null;
    const slug = path.split('/')[0].toLowerCase();
    if (RESERVED_PATHS.has(slug)) return null;
    return slug;
  }

  function checkAndInterceptRoom() {
    if (window.self !== window.top) return;
    const currentSlug = getCurrentRoomSlug();
    if (!currentSlug) return;

    // 检查是否在屏蔽列表中
    const isCurrentBlocked = isCardBlocked({ roomId: currentSlug });
    if (isCurrentBlocked) {
      muteAndPauseMedia();

      if (config.autoRedirect) {
        window.location.replace('https://www.huya.com/');
        return;
      }

      showInterceptOverlay(currentSlug);
    }
  }

  function muteAndPauseMedia() {
    const stopFn = () => {
      document.querySelectorAll('video, audio').forEach(media => {
        try {
          media.pause();
          media.muted = true;
          media.volume = 0;
        } catch (e) {}
      });
    };
    stopFn();
    setInterval(stopFn, 400);
  }

  function showInterceptOverlay(roomId) {
    if (document.getElementById('hy-intercept-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'hy-intercept-overlay';
    overlay.innerHTML = `
      <div class="hy-intercept-box">
        <div class="hy-intercept-icon">🚫</div>
        <h2>该直播间已被您屏蔽</h2>
        <p>房间标识：<strong>${roomId}</strong></p>
        <div class="hy-intercept-desc">已自动停止视频画面和声音播放</div>
        <div class="hy-intercept-actions">
          <button id="hy-btn-back-home" class="hy-btn-primary">返回虎牙首页</button>
          <button id="hy-btn-unblock" class="hy-btn-secondary">取消屏蔽并刷新</button>
          <button id="hy-btn-temporary" class="hy-btn-text">临时进入观看</button>
        </div>
      </div>
    `;

    document.documentElement.appendChild(overlay);

    document.getElementById('hy-btn-back-home').addEventListener('click', () => {
      window.location.href = 'https://www.huya.com/';
    });

    document.getElementById('hy-btn-unblock').addEventListener('click', () => {
      removeBlockedItem(roomId);
      showToast('已解除屏蔽，正在刷新...', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 500);
    });

    document.getElementById('hy-btn-temporary').addEventListener('click', () => {
      overlay.remove();
      showToast('已临时放行本页面', 'info');
    });
  }

  // ================= 5. UI 界面与交互 =================

  function injectStyles() {
    const css = `
      /* 快捷屏蔽按钮：最高 z-index 确保置于卡片最上层 */
      .hy-quick-block-btn {
        display: none !important;
        position: absolute;
        top: 6px;
        right: 6px;
        z-index: 99999 !important;
        background: rgba(235, 59, 90, 0.95);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.3);
        padding: 3px 8px;
        font-size: 11px;
        font-weight: bold;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s ease;
        box-shadow: 0 2px 6px rgba(0,0,0,0.35);
      }
      .game-live-item:hover .hy-quick-block-btn,
      .live-card:hover .hy-quick-block-btn,
      li:hover .hy-quick-block-btn,
      [data-lp]:hover .hy-quick-block-btn,
      .video-info-wrap:hover .hy-quick-block-btn,
      .recommend-item:hover .hy-quick-block-btn {
        display: inline-block !important;
      }
      .hy-quick-block-btn:hover {
        background: #ff3838;
        transform: scale(1.08);
      }

      /* 列表页右侧悬浮标签入口 */
      #hy-float-trigger {
        position: fixed;
        right: 0;
        top: 36%;
        z-index: 2147483647 !important;
        background: #ff7700;
        color: #fff;
        padding: 8px 12px;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        border-radius: 20px 0 0 20px;
        cursor: pointer;
        box-shadow: -2px 3px 12px rgba(0, 0, 0, 0.25);
        user-select: none;
        display: none;
        align-items: center;
        gap: 5px;
        transition: all 0.2s ease;
      }
      #hy-float-trigger:hover {
        background: #ff881a;
        padding-right: 16px;
      }
      #hy-float-badge {
        background: #ffffff;
        color: #ff7700;
        border-radius: 10px;
        padding: 0 6px;
        font-size: 11px;
        font-weight: bold;
      }

      /* 管理面板弹窗 */
      #hy-sb-modal-mask {
        display: none !important;
        position: fixed;
        inset: 0;
        z-index: 2147483647 !important;
        background: rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(2px);
        align-items: center;
        justify-content: center;
      }
      #hy-sb-modal-mask.show {
        display: flex !important;
      }
      #hy-sb-modal-content {
        background: #ffffff;
        color: #333333;
        width: 520px;
        max-width: 92vw;
        max-height: 85vh;
        border-radius: 12px;
        box-shadow: 0 12px 32px rgba(0,0,0,0.3);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        animation: hyFadeIn 0.2s ease;
      }
      @keyframes hyFadeIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
      }

      .hy-sb-modal-header {
        padding: 16px 20px;
        background: #f8f9fa;
        border-bottom: 1px solid #e9ecef;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .hy-sb-modal-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #212529;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .hy-sb-modal-close {
        background: transparent;
        border: none;
        font-size: 20px;
        color: #868e96;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
      }
      .hy-sb-modal-close:hover {
        color: #212529;
        background: #e9ecef;
      }

      .hy-sb-modal-body {
        padding: 18px 20px;
        overflow-y: auto;
        flex: 1;
      }

      /* 添加表单 */
      .hy-sb-form-group {
        display: flex;
        gap: 8px;
        margin-bottom: 15px;
      }
      .hy-sb-input {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid #ced4da;
        border-radius: 6px;
        font-size: 13px;
        outline: none;
        transition: border-color 0.2s;
      }
      .hy-sb-input:focus {
        border-color: #ff7700;
        box-shadow: 0 0 0 2px rgba(255, 119, 0, 0.15);
      }
      .hy-sb-input-remark {
        width: 110px;
        flex: none;
      }
      .hy-sb-btn-add {
        background: #ff7700;
        color: #fff;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
        font-weight: 500;
        white-space: nowrap;
      }
      .hy-sb-btn-add:hover {
        background: #e66b00;
      }

      /* 统计栏与搜索 */
      .hy-sb-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        font-size: 12px;
        color: #6c757d;
      }
      .hy-sb-search {
        padding: 4px 8px;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        font-size: 12px;
        width: 140px;
      }

      /* 列表区域 */
      .hy-sb-list-container {
        border: 1px solid #e9ecef;
        border-radius: 6px;
        max-height: 240px;
        overflow-y: auto;
      }
      .hy-sb-list-empty {
        padding: 30px 10px;
        text-align: center;
        color: #adb5bd;
        font-size: 13px;
      }
      .hy-sb-list-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        border-bottom: 1px solid #f1f3f5;
        font-size: 13px;
      }
      .hy-sb-list-item:last-child {
        border-bottom: none;
      }
      .hy-sb-item-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .hy-sb-item-id {
        font-weight: 600;
        color: #1971c2;
        text-decoration: none;
      }
      .hy-sb-item-id:hover {
        text-decoration: underline;
      }
      .hy-sb-item-remark {
        color: #495057;
        font-size: 12px;
      }
      .hy-sb-item-date {
        color: #868e96;
        font-size: 11px;
      }
      .hy-sb-btn-del {
        background: transparent;
        border: none;
        color: #fa5252;
        cursor: pointer;
        font-size: 13px;
        padding: 2px 6px;
        border-radius: 4px;
      }
      .hy-sb-btn-del:hover {
        background: #ffe3e3;
      }

      /* 选项 */
      .hy-sb-options-box {
        margin-top: 15px;
        padding-top: 12px;
        border-top: 1px solid #e9ecef;
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 12px;
        color: #495057;
      }
      .hy-sb-option-item {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
      }

      /* 底部工具条 */
      .hy-sb-modal-footer {
        padding: 12px 20px;
        background: #f8f9fa;
        border-top: 1px solid #e9ecef;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
      }
      .hy-sb-footer-btn-group {
        display: flex;
        gap: 8px;
      }
      .hy-sb-btn-sm {
        background: #e9ecef;
        color: #495057;
        border: none;
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
      }
      .hy-sb-btn-sm:hover {
        background: #dee2e6;
      }
      .hy-sb-btn-danger {
        color: #e03131;
      }
      .hy-sb-btn-danger:hover {
        background: #ffe3e3;
      }

      /* 拦截遮罩页面 */
      #hy-intercept-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999999;
        background: #18191c;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .hy-intercept-box {
        background: #23252a;
        border: 1px solid #32353c;
        border-radius: 12px;
        padding: 36px 40px;
        text-align: center;
        max-width: 420px;
        box-shadow: 0 16px 36px rgba(0,0,0,0.5);
      }
      .hy-intercept-icon {
        font-size: 48px;
        margin-bottom: 12px;
      }
      .hy-intercept-box h2 {
        margin: 0 0 10px;
        font-size: 20px;
        color: #ff6b6b;
      }
      .hy-intercept-box p {
        margin: 0 0 8px;
        font-size: 14px;
        color: #ced4da;
      }
      .hy-intercept-desc {
        font-size: 12px;
        color: #868e96;
        margin-bottom: 24px;
      }
      .hy-intercept-actions {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .hy-btn-primary {
        background: #ff7700;
        color: #fff;
        border: none;
        padding: 10px 18px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
      }
      .hy-btn-primary:hover {
        background: #e66b00;
      }
      .hy-btn-secondary {
        background: #343a40;
        color: #dee2e6;
        border: 1px solid #495057;
        padding: 8px 18px;
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
      }
      .hy-btn-secondary:hover {
        background: #495057;
      }
      .hy-btn-text {
        background: transparent;
        border: none;
        color: #868e96;
        font-size: 12px;
        cursor: pointer;
        margin-top: 4px;
      }
      .hy-btn-text:hover {
        color: #ced4da;
        text-decoration: underline;
      }

      /* Toast 提示 */
      #hy-toast-box {
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10000000;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: center;
      }
      .hy-toast {
        background: rgba(33, 37, 41, 0.92);
        color: #fff;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 13px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        animation: hyToastIn 0.2s ease;
      }
      @keyframes hyToastIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;

    if (typeof GM_addStyle === 'function') {
      GM_addStyle(css);
    } else {
      const style = document.createElement('style');
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    }
  }

  function showToast(msg, type = 'info') {
    let container = document.getElementById('hy-toast-box');
    if (!container) {
      container = document.createElement('div');
      container.id = 'hy-toast-box';
      (document.body || document.documentElement).appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'hy-toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2200);
  }

  function updateCounterBadge() {
    const badge = document.getElementById('hy-float-badge');
    if (badge) {
      badge.textContent = blockedList.length;
    }
    const statText = document.getElementById('hy-stat-text');
    if (statText) {
      statText.textContent = `已屏蔽 ${blockedList.length} 个主播 | 本页隐藏 ${filteredCount} 个卡片`;
    }
  }

  /**
   * 更新右侧悬浮标签的可见性：
   * 仅在列表页（首页、分类页、全部直播、搜索页）且配置开启时展示；
   * 在直播间详情页严格隐藏，不影响观看体验。
   */
  function updateFloatButtonVisibility() {
    const floatBtn = document.getElementById('hy-float-trigger');
    if (!floatBtn) return;
    if (config.showFloatBtn) {
      floatBtn.style.display = 'flex';
      if (isRoomDetailPage()) {
        floatBtn.style.opacity = '0.5';
      } else {
        floatBtn.style.opacity = '1';
      }
    } else {
      floatBtn.style.display = 'none';
    }
  }

  function createFloatingButton() {
    if (window.self !== window.top) return;
    if (document.getElementById('hy-float-trigger')) return;
    const btn = document.createElement('div');
    btn.id = 'hy-float-trigger';
    btn.innerHTML = `🛡️ 屏蔽管理 <span id="hy-float-badge">${blockedList.length}</span>`;
    btn.addEventListener('click', toggleModal);
    (document.body || document.documentElement).appendChild(btn);
    updateFloatButtonVisibility();
  }

  function createModal() {
    if (window.self !== window.top) return;
    if (document.getElementById('hy-sb-modal-mask')) return;

    const mask = document.createElement('div');
    mask.id = 'hy-sb-modal-mask';
    mask.style.setProperty('display', 'none', 'important');
    mask.innerHTML = `
      <div id="hy-sb-modal-content">
        <div class="hy-sb-modal-header">
          <h3>🛡️ 虎牙主播屏蔽管理</h3>
          <button class="hy-sb-modal-close" id="hy-sb-modal-close" title="关闭 (Esc)">&times;</button>
        </div>
        <div class="hy-sb-modal-body">
          <div class="hy-sb-form-group">
            <input type="text" id="hy-input-id" class="hy-sb-input" placeholder="输入房间号ID、网址或主播名 (如 229085 或 红莲)" />
            <input type="text" id="hy-input-remark" class="hy-sb-input hy-sb-input-remark" placeholder="备注 (可选)" />
            <button id="hy-btn-add" class="hy-sb-btn-add">添加屏蔽</button>
          </div>

          <div class="hy-sb-bar">
            <span id="hy-stat-text">已屏蔽 ${blockedList.length} 个主播 | 本页隐藏 ${filteredCount} 个卡片</span>
            <input type="text" id="hy-search-input" class="hy-sb-search" placeholder="筛选已屏蔽..." />
          </div>

          <div class="hy-sb-list-container" id="hy-list-container">
            <!-- 动态填充列表 -->
          </div>

          <div class="hy-sb-options-box">
            <label class="hy-sb-option-item">
              <input type="checkbox" id="hy-opt-quick-btn" ${config.showQuickBtn ? 'checked' : ''} />
              在直播卡片右上角显示快捷“🚫 屏蔽”小按钮 (鼠标悬停时可见)
            </label>
            <label class="hy-sb-option-item">
              <input type="checkbox" id="hy-opt-float-btn" ${config.showFloatBtn ? 'checked' : ''} />
              在列表页右侧显示悬浮入口标签 (详情页自动隐藏)
            </label>
            <label class="hy-sb-option-item">
              <input type="checkbox" id="hy-opt-redirect" ${config.autoRedirect ? 'checked' : ''} />
              误入被屏蔽直播间时直接返回首页 (默认显示拦截遮罩)
            </label>
          </div>
        </div>

        <div class="hy-sb-modal-footer">
          <div class="hy-sb-footer-btn-group">
            <button id="hy-btn-export" class="hy-sb-btn-sm" title="导出黑名单为JSON文件">导出配置</button>
            <button id="hy-btn-import" class="hy-sb-btn-sm" title="从JSON文件导入黑名单">导入配置</button>
            <input type="file" id="hy-file-input" style="display:none;" accept=".json" />
          </div>
          <button id="hy-btn-clear-all" class="hy-sb-btn-sm hy-sb-btn-danger" title="清空全部屏蔽列表">清空全部</button>
        </div>
      </div>
    `;

    (document.body || document.documentElement).appendChild(mask);

    // 事件绑定
    document.getElementById('hy-sb-modal-close').addEventListener('click', closeModal);
    mask.addEventListener('click', (e) => {
      if (e.target === mask) closeModal();
    });

    const addBtn = document.getElementById('hy-btn-add');
    const inputId = document.getElementById('hy-input-id');
    const inputRemark = document.getElementById('hy-input-remark');

    const handleAdd = () => {
      const raw = inputId.value;
      const remark = inputRemark.value;
      if (!raw.trim()) {
        showToast('请输入房间号、网址或主播名', 'info');
        return;
      }
      const res = addBlockedItem(raw, remark);
      if (res.success) {
        showToast(`已屏蔽：${res.id}`, 'success');
        inputId.value = '';
        inputRemark.value = '';
      } else {
        showToast(res.msg, 'info');
      }
    };

    addBtn.addEventListener('click', handleAdd);
    inputId.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleAdd();
    });

    // 搜索过滤
    document.getElementById('hy-search-input').addEventListener('input', (e) => {
      updateUIList(e.target.value);
    });

    // 选项变更
    document.getElementById('hy-opt-quick-btn').addEventListener('change', (e) => {
      config.showQuickBtn = e.target.checked;
      saveConfig();
      applyFilter();
    });

    document.getElementById('hy-opt-float-btn').addEventListener('change', (e) => {
      config.showFloatBtn = e.target.checked;
      saveConfig();
    });

    document.getElementById('hy-opt-redirect').addEventListener('change', (e) => {
      config.autoRedirect = e.target.checked;
      saveConfig();
    });

    // 清空全部
    document.getElementById('hy-btn-clear-all').addEventListener('click', () => {
      if (blockedList.length === 0) return;
      if (confirm('确定要清空所有已屏蔽的主播吗？')) {
        blockedList = [];
        saveList();
        showToast('已清空屏蔽列表', 'info');
      }
    });

    // 导出配置
    document.getElementById('hy-btn-export').addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(blockedList, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `huya_blocked_streamers_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });

    // 导入配置
    const fileInput = document.getElementById('hy-file-input');
    document.getElementById('hy-btn-import').addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          if (Array.isArray(parsed)) {
            let addedCount = 0;
            parsed.forEach(item => {
              const id = typeof item === 'string' ? item : item.id;
              const remark = item.remark || '';
              if (id) {
                const normId = id.toLowerCase().trim();
                const exists = blockedList.some(b => (b.id || '').toLowerCase() === normId);
                if (!exists) {
                  blockedList.push({
                    id: normId,
                    remark: remark,
                    date: item.date || new Date().toLocaleDateString()
                  });
                  addedCount++;
                }
              }
            });
            saveList();
            showToast(`成功导入 ${addedCount} 个主播`, 'success');
          } else {
            showToast('导入文件格式不正确', 'info');
          }
        } catch (err) {
          showToast('解析 JSON 文件失败', 'info');
        }
        fileInput.value = '';
      };
      reader.readAsText(file);
    });

    updateUIList();
  }

  function updateUIList(filterQuery = '') {
    const listContainer = document.getElementById('hy-list-container');
    if (!listContainer) return;

    const query = (filterQuery || '').trim().toLowerCase();
    const displayList = blockedList.filter(item => {
      if (!item || !item.id) return false;
      if (!query) return true;
      return item.id.toLowerCase().includes(query) ||
             (item.remark && item.remark.toLowerCase().includes(query));
    });

    if (displayList.length === 0) {
      listContainer.innerHTML = `<div class="hy-sb-list-empty">${query ? '无匹配的主播' : '暂无屏蔽的主播，输入房间号或主播名即可添加'}</div>`;
      updateCounterBadge();
      return;
    }

    listContainer.innerHTML = displayList.map(item => `
      <div class="hy-sb-list-item">
        <div class="hy-sb-item-left">
          <a class="hy-sb-item-id" href="https://www.huya.com/${encodeURIComponent(item.id)}" target="_blank" title="打开直播间">${escapeHtml(item.id)}</a>
          ${item.remark ? `<span class="hy-sb-item-remark">(${escapeHtml(item.remark)})</span>` : ''}
          <span class="hy-sb-item-date">${item.date || ''}</span>
        </div>
        <button class="hy-sb-btn-del" data-id="${escapeHtml(item.id)}" title="取消屏蔽">删除</button>
      </div>
    `).join('');

    listContainer.querySelectorAll('.hy-sb-btn-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        removeBlockedItem(id);
        showToast(`已解除屏蔽：${id}`, 'info');
      });
    });

    updateCounterBadge();
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function closeModal() {
    const mask = document.getElementById('hy-sb-modal-mask');
    if (mask) {
      mask.classList.remove('show');
      mask.style.setProperty('display', 'none', 'important');
    }
  }

  function openModal() {
    let mask = document.getElementById('hy-sb-modal-mask');
    if (!mask) {
      createModal();
      mask = document.getElementById('hy-sb-modal-mask');
    }
    if (mask) {
      mask.classList.add('show');
      mask.style.setProperty('display', 'flex', 'important');
      updateUIList();
      setTimeout(() => {
        const input = document.getElementById('hy-input-id');
        if (input) input.focus();
      }, 100);
    }
  }

  function toggleModal() {
    const mask = document.getElementById('hy-sb-modal-mask');
    const isShowing = mask && mask.classList.contains('show') && mask.style.display !== 'none';
    if (isShowing) {
      closeModal();
    } else {
      openModal();
    }
  }

  // ================= 6. 油猴菜单命令与初始化 =================

  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== 'function') return;

    GM_registerMenuCommand('⚙️ 虎牙主播屏蔽管理面板', () => {
      toggleModal();
    });

    const currentSlug = getCurrentRoomSlug();
    if (currentSlug) {
      GM_registerMenuCommand(`🚫 屏蔽当前直播间 (${currentSlug})`, () => {
        const res = addBlockedItem(currentSlug, '当前直播间');
        if (res.success) {
          showToast(`已将当前直播间 [${currentSlug}] 加入屏蔽`, 'success');
          checkAndInterceptRoom();
        } else {
          showToast(res.msg, 'info');
        }
      });
    }
  }

  function init() {
    injectStyles();

    // 快捷键 Alt + H 随时呼出设置面板，Esc 键关闭弹窗
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
      }
      if (e.altKey && (e.key === 'h' || e.key === 'H')) {
        toggleModal();
      }
    });

    // 检查是否误入已屏蔽直播间
    checkAndInterceptRoom();

    const onDomReady = () => {
      createFloatingButton();
      createModal();
      applyFilter();

      // 观察动态加载的内容 (如无限滚动、切换分类、Ajax刷新)
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });

      // 定时轮询补刀 (针对列表页异步渲染完成时的一键过滤)
      [300, 700, 1500, 3000].forEach(delay => {
        setTimeout(() => {
          applyFilter();
          checkAndInterceptRoom();
          updateFloatButtonVisibility();
        }, delay);
      });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onDomReady);
    } else {
      onDomReady();
    }

    // 监听 URL 变化 (兼容单页 SPA 路由切换)
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        checkAndInterceptRoom();
        debounceFilter();
        updateFloatButtonVisibility();
      }
    }, 500);

    registerMenuCommands();
  }

  init();

})();
