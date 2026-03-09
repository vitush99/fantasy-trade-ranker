// mobile/functions/src/social/triggers.ts
import * as fs from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();

// When I follow someone (doc created under /users/{uid}/following/{targetUid})
export const onFollowingCreate = fs.onDocumentCreated(
  'users/{uid}/following/{targetUid}',
  async (event) => {
    const { uid, targetUid } = event.params as { uid: string; targetUid: string };

    // bump counters defensively
    await Promise.all([
      db.doc(`users/${uid}`).update({ 'stats.following': FieldValue.increment(1) })
        .catch(() => {}),
      db.doc(`users/${targetUid}`).update({ 'stats.followers': FieldValue.increment(1) })
        .catch(() => {}),
      // mirror follower doc if somehow missing
      db.doc(`users/${targetUid}/followers/${uid}`).set(
        { uid, followedAt: new Date() },
        { merge: true }
      ),
    ]);

    // optional: create mutual friends if target also follows me
    const back = await db.doc(`users/${targetUid}/following/${uid}`).get();
    if (back.exists) {
      await Promise.all([
        db.doc(`users/${uid}/friends/${targetUid}`).set({ since: new Date() }),
        db.doc(`users/${targetUid}/friends/${uid}`).set({ since: new Date() }),
      ]);
    }
  }
);

// When I unfollow (doc deleted under /users/{uid}/following/{targetUid})
export const onFollowingDelete = fs.onDocumentDeleted(
  'users/{uid}/following/{targetUid}',
  async (event) => {
    const { uid, targetUid } = event.params as { uid: string; targetUid: string };

    await Promise.all([
      db.doc(`users/${uid}`).update({ 'stats.following': FieldValue.increment(-1) })
        .catch(() => {}),
      db.doc(`users/${targetUid}`).update({ 'stats.followers': FieldValue.increment(-1) })
        .catch(() => {}),
      db.doc(`users/${targetUid}/followers/${uid}`).delete().catch(() => {}),
      // remove mutual friends
      db.doc(`users/${uid}/friends/${targetUid}`).delete().catch(() => {}),
      db.doc(`users/${targetUid}/friends/${uid}`).delete().catch(() => {}),
    ]);
  }
);
