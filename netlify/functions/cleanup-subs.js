import { getStore } from "@netlify/blobs";
import { PENDING_DAYS } from "../lib/subs.js";

// Cada día (03:00 UTC) borra las altas de la newsletter que no se han confirmado en 30 días.
export default async () => {
  try {
    const store = getStore({ name: 'levanta-subs', consistency: 'strong' });
    const { keys } = await store.list();
    const limit = Date.now() - PENDING_DAYS * 86400000;
    let removed = 0;
    for (const { key } of keys || []) {
      const sub = await store.get(key, { type: 'json' }).catch(() => null);
      if (sub && sub.status === 'pending' && new Date(sub.requestedAt).getTime() < limit) {
        await store.delete(key);
        removed++;
      }
    }
    console.log(`cleanup-subs: ${removed} altas sin confirmar borradas`);
  } catch (e) {
    console.error('cleanup-subs:', e && e.message);
  }
};

export const config = { schedule: '0 3 * * *' };
