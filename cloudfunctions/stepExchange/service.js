// Server side of the step exchange. Nothing the client sends about steps is trusted: it passes a
// short-lived cloudID, and this function asks WeChat what that cloudID actually contains.
const ledger = require('./ledger.js');

const COLLECTION = 'step_ledger';
const MAX_DATA_AGE_SEC = 3600;

async function readSteps(cloud, cloudID, appId, nowSec) {
  if (typeof cloudID !== 'string' || !cloudID) throw new Error('missing-cloudid');
  const res = await cloud.getOpenData({ list: [cloudID] });
  const entry = res && res.list && res.list[0];
  // An invalid or expired cloudID comes back as an error entry with no data.
  const data = entry && entry.data;
  if (!data || !Array.isArray(data.stepInfoList)) throw new Error('invalid-cloudid');
  const mark = data.watermark;
  if (!mark || mark.appid !== appId) throw new Error('wrong-app');
  if (Math.abs(nowSec - mark.timestamp) > MAX_DATA_AGE_SEC) throw new Error('stale-data');
  return data.stepInfoList;
}

function isMissingCollection(err) {
  return /-502005|not exist|not found/i.test(String((err && (err.errCode || err.message || err.errMsg)) || err));
}

// One transaction per request, so two rapid taps cannot both pay out the same steps.
async function transact(db, openid, change) {
  const run = () => db.runTransaction(async (t) => {
    const ref = t.collection(COLLECTION).doc(openid);
    const got = await ref.get();
    const current = got && got.data ? got.data : null;
    if (current) delete current._id;
    const out = change(current);
    if (out.save) await ref.set({ data: out.save });
    return out.reply;
  });
  try {
    return await run();
  } catch (err) {
    if (!isMissingCollection(err)) throw err;
    await db.createCollection(COLLECTION);
    return run();
  }
}

async function handle(cloud, event, nowMs) {
  const ctx = cloud.getWXContext();
  const openid = ctx.OPENID;
  if (!openid) return { error: 'no-openid' };
  const now = Math.floor(nowMs / 1000);
  const db = cloud.database({ throwOnNotFound: false });
  try {
    if (event.action === 'ack') {
      return await transact(db, openid, (l) => ({ save: l ? ledger.ack(l, event.ids) : null, reply: { ok: true } }));
    }
    if (event.action !== 'status' && event.action !== 'exchange') return { error: 'bad-action' };
    const list = await readSteps(cloud, event.cloudID, ctx.APPID, now);
    if (event.action === 'status') {
      return await transact(db, openid, (l) => ({ reply: ledger.status(l, list, now) }));
    }
    return await transact(db, openid, (l) => {
      const r = ledger.exchange(l, list, now);
      r.ledger.updatedAt = now;
      return { save: r.ledger, reply: { view: r.view, pending: r.pending } };
    });
  } catch (err) {
    console.error('stepExchange', event.action, err);
    return { error: String((err && err.message) || err) };
  }
}

module.exports = { handle, readSteps, COLLECTION };
