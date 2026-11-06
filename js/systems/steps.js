// Connects WeChat's step data to the game: privacy agreement, then authorisation, then login, then
// getWeRunData, then the cloud function (or the local simulator during development).
const config = require('../config.js');
const ledger = require('./ledger.js');
const E = require('./economy.js');
const store = require('./store.js');

// Connection states shown by the UI.
const S = {
  IDLE: 'idle', WORKING: 'working', READY: 'ready',
  PRIVACY_DENIED: 'privacy-denied', SCOPE_DENIED: 'scope-denied', NO_WERUN: 'no-werun',
  OFFLINE: 'offline', NOT_DEPLOYED: 'not-deployed',
};

const state = { status: S.IDLE, view: null, error: '', mock: false };
let privacyUI = null; // set by the privacy scene

function isRelease() {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion === 'release';
  } catch (e) {
    return false;
  }
}

function useMock() {
  if (isRelease()) return false; // Simulated steps can never reach real players.
  if (config.STEP_BACKEND === 'mock') return true;
  if (config.STEP_BACKEND === 'cloud') return false;
  return !config.CLOUD_ENV;
}
state.mock = useMock();

function init() {
  if (config.CLOUD_ENV && wx.cloud) wx.cloud.init({ env: config.CLOUD_ENV, traceUser: false });
  if (wx.onNeedPrivacyAuthorization) {
    wx.onNeedPrivacyAuthorization((resolve) => {
      if (privacyUI) privacyUI(resolve);
      else resolve({ event: 'disagree' });
    });
  }
}

const onPrivacyNeeded = (fn) => { privacyUI = fn; };

function requirePrivacy() {
  return new Promise((ok, no) => {
    if (!wx.requirePrivacyAuthorize) return ok();
    wx.requirePrivacyAuthorize({ success: () => ok(), fail: (e) => no(e) });
  });
}

function ensureScope() {
  return new Promise((ok, no) => {
    wx.getSetting({
      success(res) {
        const v = res.authSetting['scope.werun'];
        if (v === true) return ok();
        if (v === false) return no({ scope: true });
        wx.authorize({ scope: 'scope.werun', success: () => ok(), fail: () => no({ scope: true }) });
      },
      fail: () => no({ scope: true }),
    });
  });
}

function readWeRun() {
  return new Promise((ok, no) => {
    wx.login({
      success() {
        wx.getWeRunData({ success: ok, fail: no });
      },
      fail: no,
    });
  });
}

// ---- Development simulator ----
function mockStore() {
  let m = null;
  try {
    m = wx.getStorageSync('buxulu.mockSteps');
  } catch (e) {
    m = null;
  }
  return m && m.ledger ? m : { ledger: ledger.emptyLedger(), extra: {} };
}
function mockList(m, now) {
  const today = ledger.dayKey(now);
  const list = [];
  for (let d = today - 30; d <= today; d++) {
    let s = 2400 + ((d * 7919) % 6000);
    if (d === today) s = Math.round(s * 0.6);
    s += m.extra['d' + d] || 0;
    list.push({ timestamp: d * 86400 - 8 * 3600, step: s });
  }
  return list;
}
function mockSave(m) {
  try {
    wx.setStorageSync('buxulu.mockSteps', m);
  } catch (e) {
    /* simulator only */
  }
}
function mockAddSteps(n) {
  const now = Math.floor(Date.now() / 1000);
  const m = mockStore();
  const k = 'd' + ledger.dayKey(now);
  m.extra[k] = (m.extra[k] || 0) + n;
  mockSave(m);
  return refresh();
}

// ---- Backend ----
function callBackend(action, weRun, ids) {
  if (useMock()) {
    const now = Math.floor(Date.now() / 1000);
    const m = mockStore();
    if (action === 'status') return Promise.resolve(ledger.status(m.ledger, mockList(m, now), now));
    if (action === 'exchange') {
      const r = ledger.exchange(m.ledger, mockList(m, now), now);
      m.ledger = r.ledger;
      mockSave(m);
      return Promise.resolve({ view: r.view, pending: r.pending });
    }
    m.ledger = ledger.ack(m.ledger, ids);
    mockSave(m);
    return Promise.resolve({ ok: true });
  }
  if (!config.CLOUD_ENV || !wx.cloud) return Promise.reject({ notDeployed: true });
  // Only the bare cloudID goes up. The cloud function exchanges it with WeChat itself, so a tampered
  // client has no way to hand it made-up step data.
  const data = { action };
  if (action !== 'ack') {
    if (!weRun || !weRun.cloudID) return Promise.reject({ notDeployed: true });
    data.cloudID = weRun.cloudID;
  }
  if (ids) data.ids = ids;
  return wx.cloud.callFunction({ name: 'stepExchange', data }).then((r) => {
    if (!r.result || r.result.error) throw new Error((r.result && r.result.error) || 'empty');
    return r.result;
  });
}

function classify(err) {
  const msg = String((err && (err.errMsg || err.message)) || err || '');
  if (err && err.notDeployed) return S.NOT_DEPLOYED;
  if (err && err.scope) return S.SCOPE_DENIED;
  if (err && (err.errno === 104 || /privacy permission is not authorized/.test(msg))) return S.PRIVACY_DENIED;
  if (/auth deny|auth denied|authorize:fail/.test(msg)) return S.SCOPE_DENIED;
  if (/getWeRunData/.test(msg)) return S.NO_WERUN;
  return S.OFFLINE;
}

// Applies anything the server still holds for this player, saves, then confirms receipt.
function settle(result) {
  const s = store.get();
  const pending = result.pending || [];
  const fresh = E.applyGrants(s, pending);
  if (result.view) s.steps.lastView = result.view;
  if (fresh.length || result.view) store.persist();
  if (pending.length) callBackend('ack', null, pending.map((g) => g.id)).catch(() => {});
  return fresh;
}

function run(action) {
  state.status = S.WORKING;
  state.error = '';
  return requirePrivacy()
    .then(ensureScope)
    .then(() => (useMock() ? readWeRun().catch(() => null) : readWeRun()))
    .then((weRun) => callBackend(action, weRun))
    .then((result) => {
      state.view = result.view;
      state.status = S.READY;
      return settle(result);
    })
    .catch((err) => {
      state.status = classify(err);
      state.error = String((err && (err.errMsg || err.message)) || '');
      return [];
    });
}

const refresh = () => run('status');
const exchange = () => run('exchange');

// Called from a tap, because WeChat only opens its settings page in response to a user gesture.
function openSettings() {
  return new Promise((ok) => {
    wx.openSetting({
      success(res) {
        ok(res.authSetting['scope.werun'] === true);
      },
      fail: () => ok(false),
    });
  });
}

function openPrivacy() {
  if (wx.openPrivacyContract) wx.openPrivacyContract({});
}

// The last known view keeps the hub informative before the first refresh finishes.
function view() {
  return state.view || store.get().steps.lastView;
}

module.exports = { S, state, isRelease, init, onPrivacyNeeded, refresh, exchange, openSettings, openPrivacy, view, mockAddSteps, RULES: ledger };
