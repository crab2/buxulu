// Local save plus optional cloud backup. Steps can never be claimed twice, so a lost save would
// mean lost currency. The cloud copy is what protects players when they change phones.
const E = require('./economy.js');
const config = require('../config.js');

const KEY = 'buxulu.save.v1';
let save = null;
let lastPush = 0;
let dirty = false;

function load() {
  let raw = null;
  try {
    raw = wx.getStorageSync(KEY);
  } catch (e) {
    raw = null;
  }
  save = raw && raw.v ? E.upgrade(raw) : E.defaultSave();
  return save;
}

function persist() {
  save.seq++;
  dirty = true;
  try {
    wx.setStorageSync(KEY, save);
  } catch (e) {
    console.error('save failed', e);
  }
}

function cloudReady() {
  return !!(config.CLOUD_ENV && wx.cloud);
}

function callCloud(data) {
  return wx.cloud.callFunction({ name: 'cloudSave', data }).then((r) => r.result);
}

// A newer cloud copy (another phone, or a reinstall) replaces the local one at launch.
function pull() {
  if (!cloudReady()) return Promise.resolve(false);
  return callCloud({ action: 'get' })
    .then((res) => {
      if (res && res.ok && res.blob && res.blob.v && res.blob.seq > save.seq) {
        save = E.upgrade(res.blob);
        wx.setStorageSync(KEY, save);
        return true;
      }
      return false;
    })
    .catch(() => false);
}

function push(force) {
  if (!cloudReady() || !dirty) return Promise.resolve(false);
  const now = Date.now();
  if (!force && now - lastPush < 60000) return Promise.resolve(false);
  lastPush = now;
  dirty = false;
  return callCloud({ action: 'put', blob: save })
    .then((res) => !!(res && res.ok))
    .catch(() => {
      dirty = true;
      return false;
    });
}

function reset() {
  save = E.defaultSave();
  try {
    wx.removeStorageSync(KEY);
  } catch (e) {
    /* nothing to remove */
  }
  return save;
}

module.exports = { load, persist, pull, push, reset, get: () => save };
