// Browser stand-in for the WeChat runtime, used only by the web preview and automated tests.
// It is never included in the mini-game package.
(function () {
  const frame = document.getElementById('phone') || document.body;
  if (new URLSearchParams(location.search).get('fill')) {
    frame.style.cssText = 'width:100vw;height:100vh;max-width:none;max-height:none;aspect-ratio:auto;border-radius:0';
    const note = document.getElementById('note');
    if (note) note.style.display = 'none';
  }
  const rectOf = () => frame.getBoundingClientRect();
  // The game sizes itself once at launch, so later touches are mapped back to that original size.
  // A viewer that has not laid out yet reports zero, and then a typical phone size is assumed.
  const measured = rectOf();
  const base = measured.width > 50 && measured.height > 50 ? { width: measured.width, height: measured.height } : { width: 390, height: 844 };
  const params = new URLSearchParams(location.search);
  // Behaviour a real phone may have and desktop Chromium does not, so tests can see what the game does there.
  // smoothing=ignored: the 2D canvas filters however it is asked. webgl=none: no WebGL at all.
  // webgl=broken: WebGL starts, but uploading a canvas does nothing.
  if (params.get('smoothing') === 'ignored') {
    Object.defineProperty(CanvasRenderingContext2D.prototype, 'imageSmoothingEnabled', { get: () => true, set() {} });
  }
  if (params.get('webgl') === 'none') {
    const realContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, o) { return type === 'webgl' ? null : realContext.call(this, type, o); };
  }
  if (params.get('webgl') === 'broken') WebGLRenderingContext.prototype.texImage2D = function () {};
  const handlers = { start: [], move: [], end: [], cancel: [], show: [], hide: [] };
  let first = true;
  let privacyHandler = null;

  function touchEvent(e) {
    const r = rectOf();
    const k = r.width > 0 ? base.width / r.width : 1;
    const t = { identifier: e.pointerId || 0, clientX: (e.clientX - r.left) * k, clientY: (e.clientY - r.top) * k };
    return { touches: e.type === 'pointerup' ? [] : [t], changedTouches: [t] };
  }

  function makeCanvas() {
    const c = document.createElement('canvas');
    if (first) {
      first = false;
      c.id = 'game';
      c.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;image-rendering:pixelated';
      frame.appendChild(c);
      const cap = window.wx.getMenuButtonBoundingClientRect();
      const pill = document.createElement('div');
      pill.style.cssText = `position:absolute;left:${(cap.left / base.width) * 100}%;top:${(cap.top / base.height) * 100}%;width:${(cap.width / base.width) * 100}%;height:${(cap.height / base.height) * 100}%;border-radius:999px;background:#0006;border:1px solid #fff3;display:flex;align-items:center;justify-content:space-around;color:#fff;font:600 13px sans-serif;pointer-events:none;box-sizing:border-box`;
      pill.innerHTML = '<span>&middot;&middot;&middot;</span><span style="opacity:.3">|</span><span>&#9673;</span>';
      frame.appendChild(pill);
      c.addEventListener('pointerdown', (e) => {
        try { c.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events have no capture */ }
        handlers.start.forEach((h) => h(touchEvent(e)));
      });
      c.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') handlers.move.forEach((h) => h(touchEvent(e))); });
      c.addEventListener('pointerup', (e) => handlers.end.forEach((h) => h(touchEvent(e))));
      c.addEventListener('pointercancel', (e) => handlers.cancel.forEach((h) => h(touchEvent(e))));
    }
    return c;
  }

  const audioUnlock = [];
  window.addEventListener('pointerdown', () => { audioUnlock.splice(0).forEach((f) => f()); }, { once: false });

  const state = window.__wxMock = {
    auth: { 'scope.werun': params.get('werun') === 'denied' ? false : undefined },
    privacyAgreed: params.get('privacy') !== 'ask',
    calls: [],
  };

  function cb(o, res, fail) {
    setTimeout(() => {
      if (fail) { if (o.fail) o.fail(res); } else if (o.success) o.success(res);
      if (o.complete) o.complete(res);
    }, 30);
  }

  window.wx = {
    createCanvas: makeCanvas,
    getWindowInfo() {
      const r = base;
      const pr = Number(params.get('dpr')) || Math.min(3, window.devicePixelRatio || 2);
      const notch = Number(params.get('notch') || 44);
      return {
        windowWidth: Math.round(r.width), windowHeight: Math.round(r.height), screenWidth: Math.round(r.width), screenHeight: Math.round(r.height), pixelRatio: pr,
        statusBarHeight: notch, safeArea: { top: notch, left: 0, right: Math.round(r.width), bottom: Math.round(r.height) - Number(params.get('home') || 20), width: Math.round(r.width), height: Math.round(r.height) - notch },
      };
    },
    getMenuButtonBoundingClientRect() {
      const r = base;
      const notch = Number(params.get('notch') || 44);
      return { left: r.width - 97, right: r.width - 10, top: notch + 4, bottom: notch + 36, width: 87, height: 32 };
    },
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop', appId: 'preview' } }),
    onTouchStart: (h) => handlers.start.push(h),
    onTouchMove: (h) => handlers.move.push(h),
    onTouchEnd: (h) => handlers.end.push(h),
    onTouchCancel: (h) => handlers.cancel.push(h),
    onShow: (h) => handlers.show.push(h),
    onHide: (h) => handlers.hide.push(h),
    getStorageSync(k) {
      try { const v = localStorage.getItem('wx:' + k); return v === null ? '' : JSON.parse(v); } catch (e) { return ''; }
    },
    setStorageSync(k, v) { try { localStorage.setItem('wx:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    removeStorageSync(k) { try { localStorage.removeItem('wx:' + k); } catch (e) { /* private mode */ } },
    vibrateShort() {},
    setPreferredFramesPerSecond(n) { state.fps = n; },
    setKeepScreenOn(o) { state.keepOn = o.keepScreenOn; },
    onMemoryWarning(h) { state.memoryWarning = h; },
    showShareMenu() {},
    onShareAppMessage() {},
    shareAppMessage() {},
    getUpdateManager: () => ({ onUpdateReady() {}, onCheckForUpdate() {}, onUpdateFailed() {}, applyUpdate() {} }),
    createInnerAudioContext() {
      const a = new Audio();
      const ctx = {
        get src() { return a.src; }, set src(v) { a.src = v; },
        get loop() { return a.loop; }, set loop(v) { a.loop = v; },
        get volume() { return a.volume; }, set volume(v) { a.volume = v; },
        get paused() { return a.paused; },
        play() { const p = a.play(); if (p && p.catch) p.catch(() => audioUnlock.push(() => a.play().catch(() => {}))); },
        pause() { a.pause(); }, stop() { a.pause(); try { a.currentTime = 0; } catch (e) { /* not loaded */ } },
        seek(t) { try { a.currentTime = t; } catch (e) { /* not loaded */ } },
        destroy() { a.pause(); }, onError() {},
      };
      return ctx;
    },
    // Authorisation flow
    onNeedPrivacyAuthorization(h) { privacyHandler = h; },
    requirePrivacyAuthorize(o) {
      state.calls.push('requirePrivacyAuthorize');
      if (state.privacyAgreed) return cb(o, {});
      if (!privacyHandler) return cb(o, { errno: 104, errMsg: 'privacy permission is not authorized' }, true);
      privacyHandler((r) => {
        if (r.event === 'agree') { state.privacyAgreed = true; cb(o, {}); }
        if (r.event === 'disagree') cb(o, { errno: 104, errMsg: 'privacy permission is not authorized' }, true);
      });
    },
    openPrivacyContract(o) { state.calls.push('openPrivacyContract'); cb(o || {}, {}); },
    getSetting(o) { cb(o, { authSetting: state.auth }); },
    authorize(o) {
      state.calls.push('authorize');
      if (state.auth[o.scope] === false) return cb(o, { errMsg: 'authorize:fail auth deny' }, true);
      state.auth[o.scope] = true;
      cb(o, { errMsg: 'authorize:ok' });
    },
    openSetting(o) { state.calls.push('openSetting'); state.auth['scope.werun'] = true; cb(o, { authSetting: state.auth }); },
    login(o) { state.calls.push('login'); cb(o, { code: 'mock' }); },
    getWeRunData(o) { state.calls.push('getWeRunData'); cb(o, { encryptedData: 'mock', iv: 'mock', cloudID: 'mock' }); },
  };
  window.GameGlobal = window;
})();
