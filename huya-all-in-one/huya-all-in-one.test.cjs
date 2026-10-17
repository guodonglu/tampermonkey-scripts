const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/huya-all-in-one.user.js`, 'utf8');

function setup() {
  let now = 0;
  let id = 0;
  const timers = new Map();
  const events = {};
  const document = {
    readyState: 'loading',
    body: { classList: { contains: () => false }, appendChild() {} },
    documentElement: { appendChild() {} },
    head: { appendChild() {} },
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({ id: '', textContent: '', style: {}, appendChild() {}, classList: { contains: () => false, add() {}, remove() {} } }),
    addEventListener: (name, fn) => { events[name] = fn; }
  };
  let capturedApi = null;
  class MockDate {
    constructor() {}
    static now() { return now; }
    toLocaleDateString() { return '2026/10/17'; }
  }
  const context = vm.createContext({
    AbortController, DOMException, URL,
    console: { info() {}, warn() {} },
    Date: MockDate,
    setTimeout(fn, ms) { timers.set(++id, { fn, at: now + ms }); return id; },
    clearTimeout(key) { timers.delete(key); },
    setInterval() { return 1; },
    clearInterval() {},
    MutationObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({ visibility: 'visible', display: 'block', position: 'relative' }),
    window: {
      location: { href: 'https://www.huya.com/123', pathname: '/123' },
      addEventListener: (name, fn) => { events[name] = fn; },
      self: 1, top: 1
    },
    history: { pushState() {}, replaceState() {} },
    document,
    __HUYA_AIO_TEST_HOOK__: api => { capturedApi = api; }
  });

  vm.runInContext(source, context);

  const flush = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
  const tick = async ms => {
    const end = now + ms;
    await flush();
    while (true) {
      const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
      await flush();
    }
    now = end;
    await flush();
  };
  return { ...capturedApi, context, document, events, tick };
}

// ==================== 画质与观影测试 ====================

test('manual and automatic theater actions each click once', async () => {
  for (const automatic of [false, true]) {
    const env = setup();
    let active = false;
    let clicks = 0;
    const btn = { classList: { contains: () => false }, getAttribute: () => '',
      click() { active = !active; clicks++; } };
    env.document.body.classList.contains = () => active;
    env.document.querySelector = selector => selector === env.SELECTORS.theaterBtns ? btn : null;
    if (automatic) {
      const job = env.applyTheaterMode(new AbortController().signal);
      await env.tick(300);
      await job;
    } else env.toggleTheaterMode();
    assert.equal(clicks, 1);
    assert.equal(active, true);
  }
});

test('old task cleanup cannot clear or share the new task controller', async () => {
  const env = setup();
  const a = env.runner.execute();
  const b = env.runner.execute();
  await env.tick(0);
  assert.equal(env.runner.isProcessing, true);
  const second = env.runner.controller;
  const c = env.runner.execute();
  assert.equal(second.signal.aborted, true);
  assert.notEqual(env.runner.controller, second);
  env.runner.abort();
  await Promise.all([a, b, c]);
});

function qualityFixture(env) {
  env.config.unlockQuality = false;
  const current = { textContent: '高清' };
  const target = { textContent: '原画', click() {} };
  env.document.querySelectorAll = () => [target];
  env.document.querySelector = selector => selector === env.SELECTORS.currentQuality ? current : null;
  return { current, target };
}

test('quality timeout rejects instead of reporting success', async () => {
  const env = setup();
  qualityFixture(env);
  const checked = assert.rejects(env.applyQuality(new AbortController().signal), /未确认切换/);
  await env.tick(15000);
  await checked;
});

test('quality cancellation propagates and does not update the badge', async () => {
  const env = setup();
  qualityFixture(env);
  const updates = [];
  env.setBadgeUpdater(text => updates.push(text));
  const controller = new AbortController();
  const checked = assert.rejects(env.applyQuality(controller.signal), { name: 'AbortError' });
  await env.tick(0);
  controller.abort();
  await checked;
  assert.equal(updates.length, 0);
});

test('confirmed quality change succeeds', async () => {
  const env = setup();
  const { current, target } = qualityFixture(env);
  target.click = () => { current.textContent = '原画'; };
  const job = env.applyQuality(new AbortController().signal);
  await env.tick(2000);
  assert.match(await job, /已确认目标画质: 原画/);
});

test('ad click without effect keeps monitoring and never reports success', async () => {
  const env = setup();
  let clicks = 0;
  const button = { isConnected: true, getClientRects: () => [1], getAttribute: () => null, click() { clicks++; } };
  env.document.querySelectorAll = selector => selector === env.SELECTORS.adButtons ? [button] : [];
  const job = env.applyAdSkipper(new AbortController().signal);
  await env.tick(15000);
  assert.match(await job, /未确认广告结束/);
  assert.ok(clicks > 1 && clicks <= 10);
});

test('ad success requires observed advertisement area to disappear', async () => {
  const env = setup();
  const container = { isConnected: true, getClientRects: () => [1] };
  const button = { isConnected: true, getClientRects: () => [1], getAttribute: () => null,
    click() { container.isConnected = false; this.isConnected = false; } };
  env.document.querySelectorAll = selector => selector === env.SELECTORS.adButtons ? [button] : [container];
  const job = env.applyAdSkipper(new AbortController().signal);
  await env.tick(500);
  assert.match(await job, /确认广告区域消失/);
});

test('rapid navigation cancels immediately and starts only the latest route', async () => {
  const env = setup();
  const job = env.runner.execute();
  const controller = env.runner.controller;
  let runs = 0;
  env.runner.execute = () => { runs++; };
  env.context.window.location.href += 'a';
  env.handleUrlChange();
  assert.equal(controller.signal.aborted, true);
  await env.tick(400);
  env.context.window.location.href += 'b';
  env.handleUrlChange();
  await env.tick(400);
  assert.equal(runs, 0);
  await env.tick(400);
  assert.equal(runs, 1);
  await job;
});

test('initial pageshow does not duplicate DOM startup; pagehide clears navigation', async () => {
  const env = setup();
  env.prepareInit();
  let runs = 0;
  env.runner.execute = () => { runs++; };
  env.init();
  env.events.DOMContentLoaded();
  env.events.pageshow({ persisted: false });
  assert.equal(runs, 1);
  env.events.pageshow({ persisted: true });
  assert.equal(runs, 2);
  env.context.window.location.href += 'a';
  env.handleUrlChange();
  env.events.pagehide();
  await env.tick(1000);
  assert.equal(runs, 2);
});

test('non-room pages do not start optimization', async () => {
  const env = setup();
  env.context.window.location.pathname = '/all';
  await env.runner.execute();
  assert.equal(env.runner.controller, null);
  assert.equal(env.runner.isProcessing, false);
});

test('quality retries when player handlers become ready after the first click', async () => {
  const env = setup();
  const { current, target } = qualityFixture(env);
  let clicks = 0;
  target.click = () => { if (++clicks >= 2) current.textContent = '原画'; };
  const job = env.applyQuality(new AbortController().signal);
  await env.tick(4000);
  assert.match(await job, /已确认目标画质: 原画/);
  assert.equal(clicks, 2);
});

test('quality recovers when startup resets quality and replaces its menu', async () => {
  const env = setup();
  const { current, target } = qualityFixture(env);
  target.click = () => { current.textContent = '原画'; };
  const job = env.applyQuality(new AbortController().signal);
  await env.tick(400);
  current.textContent = '高清';
  let clicks = 0;
  const replacement = { textContent: '原画', click() { clicks++; current.textContent = '原画'; } };
  env.document.querySelectorAll = () => [replacement];
  await env.tick(2400);
  assert.match(await job, /已确认目标画质: 原画/);
  assert.equal(clicks, 1);
});

test('query and hash changes do not cancel startup even with navigation disabled', async () => {
  const env = setup();
  env.config.watchNavigation = false;
  const job = env.runner.execute();
  const controller = env.runner.controller;
  env.context.window.location.href += '?from=home#player';
  env.handleUrlChange();
  assert.equal(controller.signal.aborted, false);
  env.runner.abort();
  await job;
});

test('manual theater toggle does not cancel automatic quality', async () => {
  const env = setup();
  const job = env.runner.execute();
  const controller = env.runner.controller;
  const theater = env.runner.theaterController;
  env.toggleTheaterMode();
  assert.equal(controller.signal.aborted, false);
  assert.equal(theater.signal.aborted, true);
  env.runner.abort();
  await job;
});

test('room 102411 delayed quality menu selects 蓝光20M by default', async () => {
  const env = setup();
  env.config.unlockQuality = false;
  const current = { textContent: '超清' };
  const items = ['蓝光20M', '蓝光8M', '蓝光4M', '超清', '流畅'].map(textContent => ({
    textContent, click() { current.textContent = textContent; }
  }));
  const job = env.applyQuality(new AbortController().signal);
  await env.tick(3000);
  env.document.querySelectorAll = () => items;
  env.document.querySelector = selector => selector === env.SELECTORS.currentQuality ? current : null;
  await env.tick(3000);
  assert.match(await job, /已确认目标画质: 蓝光20M/);
  assert.equal(current.textContent, '蓝光20M');
});

// ==================== 主播屏蔽模块测试 ====================

test('streamer blocker: input parsing handles urls, slugs, nicknames and rejects reserved paths', () => {
  const env = setup();
  assert.equal(env.parseInput('https://www.huya.com/229085'), '229085');
  assert.equal(env.parseInput('https://www.huya.com/kpl'), 'kpl');
  assert.equal(env.parseInput('红莲'), '红莲');
  assert.equal(env.parseInput('https://www.huya.com/all'), null);
  assert.equal(env.parseInput('g'), null);
});

test('streamer blocker: add and remove blocked item correctly', () => {
  const env = setup();
  const res = env.addBlockedItem('229085', '测试主播');
  assert.equal(res.success, true);
  assert.equal(res.id, '229085');

  // 重复添加
  const dup = env.addBlockedItem('229085');
  assert.equal(dup.success, false);

  // 匹配检查
  assert.equal(env.isCardBlocked({ roomId: '229085' }), true);
  assert.equal(env.isCardBlocked({ roomId: '999999' }), false);

  // 模糊匹配昵称
  env.addBlockedItem('神超');
  assert.equal(env.isCardBlocked({ nick: '主播神超丶666' }), true);
  assert.equal(env.isCardBlocked({ nick: '超神不是神' }), false);

  // 删除
  env.removeBlockedItem('229085');
  assert.equal(env.isCardBlocked({ roomId: '229085' }), false);
});

// ==================== 广告屏蔽模块测试 ====================

test('ad blocker: buildCSS generates valid css rules based on configuration', () => {
  const env = setup();
  env.config.blockSidebarAd = true;
  env.config.blockPlayerWidgets = true;
  env.config.blockWatermark = true;
  const css = env.buildCSS();
  assert.ok(css.includes('#J_roomSideTop'));
  assert.ok(css.includes('.diy-comps-wrap'));
  assert.ok(css.includes('#hy-watermark'));

  env.config.blockWatermark = false;
  const cssWithoutWatermark = env.buildCSS();
  assert.ok(!cssWithoutWatermark.includes('#hy-watermark'));
});

// ==================== 动态加载器测试 ====================

test('loader: valid metadata headers and parseable code structure', async () => {
  const loaderSource = fs.readFileSync(`${__dirname}/huya-all-in-one.loader.user.js`, 'utf8');
  assert.ok(loaderSource.includes('// ==UserScript=='));
  assert.ok(loaderSource.includes('@name         虎牙全能助手 (GitHub 动态同步版)'));
  assert.ok(loaderSource.includes('@grant        GM_xmlhttpRequest'));
  assert.ok(loaderSource.includes('@grant        unsafeWindow'));
  assert.ok(loaderSource.includes('@connect      raw.githubusercontent.com'));
  assert.ok(loaderSource.includes('@updateURL'));
  assert.ok(loaderSource.includes('@downloadURL'));
  assert.ok(loaderSource.includes('STORAGE_KEY_CODE = \'hy_aio_cached_code\''));

  // Ensure loader script evaluates cleanly in VM
  const storage = new Map();
  const menuCommands = new Map();
  let requestedUrl = null;
  const loaderContext = vm.createContext({
    URL,
    console: { log() {}, warn() {}, error() {} },
    Date,
    setTimeout(fn) { fn(); return 1; },
    clearTimeout() {},
    location: { reload() {}, href: 'https://www.huya.com/123' },
    document: {
      body: { appendChild() {} },
      documentElement: { appendChild() {} },
      createElement: () => ({ style: {}, classList: { add() {} }, remove() {} }),
      addEventListener() {}
    },
    GM_getValue: (k, def) => (storage.has(k) ? storage.get(k) : def),
    GM_setValue: (k, v) => { storage.set(k, v); },
    GM_deleteValue: (k) => { storage.delete(k); },
    GM_registerMenuCommand: (name, fn) => { menuCommands.set(name, fn); },
    GM_xmlhttpRequest: ({ url, onload }) => {
      requestedUrl = url;
      Promise.resolve().then(() => {
        onload({
          status: 200,
          responseText: `// ==UserScript==\n// @version 3.1.0\n// huya-all-in-one\n(function () { globalThis.__LOADER_TEST_EXECUTED__ = 123; })();`
        });
      });
    }
  });

  vm.runInContext(loaderSource, loaderContext);

  // Allow async promises inside loader to finish
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }

  assert.ok(requestedUrl.includes('raw.githubusercontent.com'));
  assert.equal(storage.get('hy_aio_cached_version'), '3.1.0');
  assert.ok(storage.get('hy_aio_cached_code').includes('__LOADER_TEST_EXECUTED__'));
  assert.ok(menuCommands.has('⚡ 强制检查并同步 GitHub 最新代码'));
});

test('loader: SWR executes cached script synchronously before network returns', async () => {
  const loaderSource = fs.readFileSync(`${__dirname}/huya-all-in-one.loader.user.js`, 'utf8');
  const storage = new Map([
    ['hy_aio_cached_code', `// ==UserScript==\n// @version 3.0.0\n// huya-all-in-one\n(function () { globalThis.__SWR_TEST_CACHED_SYNC__ = 'from_cache'; })();`],
    ['hy_aio_cached_version', '3.0.0']
  ]);
  let networkFinished = false;

  const loaderContext = vm.createContext({
    URL,
    console: { log() {}, warn() {}, error() {} },
    Date,
    setTimeout(fn) { fn(); return 1; },
    clearTimeout() {},
    location: { reload() {}, href: 'https://www.huya.com/123' },
    document: {
      body: { appendChild() {} },
      documentElement: { appendChild() {} },
      createElement: () => ({ style: {}, classList: { add() {} }, remove() {} }),
      addEventListener() {}
    },
    GM_getValue: (k, def) => (storage.has(k) ? storage.get(k) : def),
    GM_setValue: (k, v) => { storage.set(k, v); },
    GM_deleteValue: (k) => { storage.delete(k); },
    GM_registerMenuCommand: () => {},
    GM_xmlhttpRequest: ({ onload }) => {
      // Simulate network latency: returns later
      Promise.resolve().then(() => {
        networkFinished = true;
        onload({
          status: 200,
          responseText: `// ==UserScript==\n// @version 3.1.0\n// huya-all-in-one\n(function () { globalThis.__SWR_TEST_NEW__ = 'from_remote'; })();`
        });
      });
    }
  });

  // Run script
  vm.runInContext(loaderSource, loaderContext);

  // Cached code must have executed synchronously (0ms delay) BEFORE network returned
  assert.equal(loaderContext.__SWR_TEST_CACHED_SYNC__, 'from_cache');
  assert.equal(networkFinished, false);

  // Now wait for network to finish
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }

  assert.equal(networkFinished, true);
  // Cache has been updated in background
  assert.equal(storage.get('hy_aio_cached_version'), '3.1.0');
});

test('badge: auto-collapses after 10 seconds and uncollapses on new room navigation', async () => {
  const env = setup();
  const createdElements = [];
  env.context.document.createElement = () => {
    const classes = new Set();
    const listeners = {};
    const el = {
      id: '',
      style: {},
      classList: {
        add(c) { classes.add(c); },
        remove(c) { classes.delete(c); },
        contains(c) { return classes.has(c); }
      },
      appendChild() {},
      querySelector: () => ({ style: {}, textContent: '', addEventListener() {} }),
      querySelectorAll: () => [],
      addEventListener: (type, fn) => { listeners[type] = fn; },
      _trigger(type) { if (listeners[type]) listeners[type](); }
    };
    createdElements.push(el);
    return el;
  };
  env.context.document.getElementById = (id) => (id === 'hy-aio-badge' ? null : { addEventListener() {}, style: {}, value: '', checked: false });

  // Trigger DOMContentLoaded
  env.events['DOMContentLoaded']();

  const badge = env.getBadgeEl();
  assert.ok(badge);
  assert.equal(badge.classList.contains('hy-aio-collapsed'), false);

  // Advance time by 5 seconds: still not collapsed
  await env.tick(5000);
  assert.equal(badge.classList.contains('hy-aio-collapsed'), false);

  // Advance past 10 seconds: now collapsed
  await env.tick(5001);
  assert.equal(badge.classList.contains('hy-aio-collapsed'), true);

  // Simulate mouseenter: user hovers, then mouseleave after timer elapsed
  badge._trigger('mouseenter');
  badge._trigger('mouseleave');
  assert.equal(badge.classList.contains('hy-aio-collapsed'), true);

  // Simulate changing room: should uncollapse and reset 10s timer
  env.context.window.location.href = 'https://www.huya.com/99999';
  env.handleUrlChange();
  assert.equal(badge.classList.contains('hy-aio-collapsed'), false);

  // Advance 10s again: collapses again
  await env.tick(10001);
  assert.equal(badge.classList.contains('hy-aio-collapsed'), true);
});



