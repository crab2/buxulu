// Stores each player's save as one JSON string, keyed by the openid WeChat vouches for.
const COLLECTION = 'saves';
const MAX_BYTES = 200 * 1024;

function isMissingCollection(err) {
  return /-502005|not exist|not found/i.test(String((err && (err.errCode || err.message || err.errMsg)) || err));
}

async function handle(cloud, event, nowMs) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, error: 'no-openid' };
  const db = cloud.database({ throwOnNotFound: false });
  const ref = db.collection(COLLECTION).doc(OPENID);
  try {
    if (event.action === 'get') {
      const got = await ref.get();
      return { ok: true, blob: got && got.data && got.data.json ? JSON.parse(got.data.json) : null };
    }
    if (event.action === 'put') {
      const blob = event.blob;
      if (!blob || typeof blob !== 'object' || !Number.isFinite(blob.seq)) return { ok: false, error: 'bad-blob' };
      const json = JSON.stringify(blob);
      if (json.length > MAX_BYTES) return { ok: false, error: 'too-large' };
      const got = await ref.get();
      // A stale device must not overwrite newer progress from another device.
      if (got && got.data && got.data.seq > blob.seq) return { ok: false, error: 'stale', seq: got.data.seq };
      await ref.set({ data: { json, seq: blob.seq, updatedAt: Math.floor(nowMs / 1000) } });
      return { ok: true };
    }
    return { ok: false, error: 'bad-action' };
  } catch (err) {
    if (isMissingCollection(err)) {
      await db.createCollection(COLLECTION);
      return event.action === 'get' ? { ok: true, blob: null } : handle(cloud, event, nowMs);
    }
    console.error('cloudSave', err);
    return { ok: false, error: String((err && err.message) || err) };
  }
}

module.exports = { handle, COLLECTION };
