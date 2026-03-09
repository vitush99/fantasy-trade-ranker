// mobile/functions/src/social/follow.ts
import * as https from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();

export const followUser = https.onCall(async (req) => {
  const uid = req.auth?.uid;
  const { targetUid } = (req.data || {}) as { targetUid?: string };

  if (!uid) throw new https.HttpsError('unauthenticated', 'Login required');
  if (!targetUid || targetUid === uid) {
    throw new https.HttpsError('invalid-argument', 'Invalid target user');
  }

  const meRef = db.doc(`users/${uid}`);
  const targetRef = db.doc(`users/${targetUid}`);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) throw new https.HttpsError('not-found', 'User not found');

  const followingRef = meRef.collection('following').doc(targetUid);
  const followerRef  = targetRef.collection('followers').doc(uid);

  // idempotent
  if ((await followingRef.get()).exists) return { ok: true };

  const target = targetSnap.data() || {};
  const now = new Date();

  await db.runTransaction(async (trx) => {
    trx.set(followingRef, {
      uid: targetUid,
      username: target.username || '',
      displayName: target.displayName || '',
      photoURL: target.photoURL || '',
      followedAt: now,
    });

    trx.set(followerRef, {
      uid, // me
      followedAt: now,
    });
  });

  return { ok: true };
});

export const unfollowUser = https.onCall(async (req) => {
  const uid = req.auth?.uid;
  const { targetUid } = (req.data || {}) as { targetUid?: string };

  if (!uid) throw new https.HttpsError('unauthenticated', 'Login required');
  if (!targetUid || targetUid === uid) {
    throw new https.HttpsError('invalid-argument', 'Invalid target user');
  }

  const meRef = db.doc(`users/${uid}`);
  const targetRef = db.doc(`users/${targetUid}`);

  const followingRef = meRef.collection('following').doc(targetUid);
  const followerRef  = targetRef.collection('followers').doc(uid);

  await db.runTransaction(async (trx) => {
    trx.delete(followingRef);
    trx.delete(followerRef);
  });

  return { ok: true };
});
