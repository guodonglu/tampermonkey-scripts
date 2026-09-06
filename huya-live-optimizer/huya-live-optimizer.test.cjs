const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/huya-live-optimizer.user.js`, 'utf8');

function setup() {
  let now = 0;
  let id = 0;
  const timers = new Map();
  const events = {};
  const document = {
    readyState: 'loading',
    body: { classList: { contains: () => false } },
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: (name, fn) => { events[name] = fn; }
  };
  const context = vm.createContext({
    AbortController, DOMException, URL,
    console: { info() {}, warn() {} },
    Date: { now: () => now },
    setTimeout(fn, ms) { timers.set(++id, { fn, at: now + ms }); return id; },
    clearTimeout(key) { timers.delete(key); },
    getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
    window: { location: { href: 'https://www.huya.com/123', pathname: '/123' },
      addEventListener: (name, fn) => { events[name] = fn; } },
    history: { pushState() {}, replaceState() {} },
    document
  });
  vm.runInContext(source.replace(/  init\(\);\s*\}\)\(\);\s*$/,
    '  globalThis.api = { runner, applyQuality, applyAdSkipper, applyTheaterMode, toggleTheaterMode, handleUrlChange, init, config, SELECTORS, setBadgeUpdater(fn) { updateBadgeQuality = fn; }, prepareInit() { injectStyles = () => {}; createBadge = () => {}; createModal = () => {}; } };\n})();'), context);
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
  return { ...context.api, context, document, events, tick };
}

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
  assert.ok(!env.SELECTORS.adButtons.includes('.player-ad-tip span'));
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
