import * as https from 'firebase-functions/v2/https';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';

const db = getFirestore();

/**
 * Callable: backfillUserSearch (no auth required)
 * Args: { cursor?: string, batchSize?: number }
 */
export const backfillUserSearch = https.onCall(async (req) => {
  const { cursor, batchSize = 500 } = (req.data || {}) as { cursor?: string; batchSize?: number };

  const usersCol = db.collection('users');
  let q = usersCol.orderBy(FieldPath.documentId()).limit(batchSize);
  if (cursor) q = q.startAfter(cursor);

  const snap = await q.get();
  if (snap.empty) return { updated: 0, scanned: 0, nextCursor: null };

  let updated = 0;
  const batch = db.batch();

  for (const docSnap of snap.docs) {
    const d = docSnap.data() || {};
    const username: string = (d.username ?? '').toString();
    const want = username.toLowerCase();
    const have = (d.search?.username_lower ?? '').toString();
    if (want && want !== have) {
      batch.set(docSnap.ref, { search: { username_lower: want } }, { merge: true });
      updated++;
    }
  }

  if (updated > 0) await batch.commit();

  const lastId = snap.docs[snap.docs.length - 1].id;
  return { updated, scanned: snap.size, nextCursor: lastId };
});
