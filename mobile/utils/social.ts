// mobile/utils/social.ts
import { httpsCallable } from 'firebase/functions';
import {
  collection, getDocs, limit, orderBy, query, startAfter, where, doc, getDoc
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { getFunctions } from 'firebase/functions';
const functions = getFunctions(getApp(), 'us-central1');
import { startAt, endAt } from 'firebase/firestore';
import { db } from '@myfirebase';

// --- Callables ---
export async function followUser(targetUid: string) {
  return httpsCallable(functions, 'followUser')({ targetUid });
}
export async function unfollowUser(targetUid: string) {
  return httpsCallable(functions, 'unfollowUser')({ targetUid });
}

// --- Paging: Following ---
export async function pageFollowing(uid: string, pageSize = 25, cursor?: any) {
  const ref = collection(db, `users/${uid}/following`);
  const q = cursor
    ? query(ref, orderBy('followedAt', 'desc'), startAfter(cursor), limit(pageSize))
    : query(ref, orderBy('followedAt', 'desc'), limit(pageSize));
  const snap = await getDocs(q);
  return { items: snap.docs.map(d => ({ id: d.id, ...d.data() })), cursor: snap.docs.at(-1) };
}

// --- Paging: Followers (enrich row with profile) ---
export async function pageFollowers(uid: string, pageSize = 25, cursor?: any) {
  const ref = collection(db, `users/${uid}/followers`);
  const q = cursor
    ? query(ref, orderBy('followedAt', 'desc'), startAfter(cursor), limit(pageSize))
    : query(ref, orderBy('followedAt', 'desc'), limit(pageSize));
  const snap = await getDocs(q);

  // Followers docs are minimal; enrich each with /users/{uid} profile fields
  const enriched = await Promise.all(
    snap.docs.map(async d => {
      const f = d.data() as any; // { uid, followedAt }
      const profile = await getDoc(doc(db, 'users', f.uid || d.id));
      return { uid: f.uid || d.id, ...profile.data(), followedAt: f.followedAt };
    })
  );
  return { items: enriched, cursor: snap.docs.at(-1) };
}

// --- Prefix search on username & display name ---
export async function searchUsersPrefix(prefix: string, max = 20) {
    const s = prefix.trim().toLowerCase();
    if (!s) return [];
    const users = collection(db, 'users');
    const q = query(
      users,
      orderBy('search.username_lower'),
      startAt(s),
      endAt(s + '\uf8ff')
    );
    const snap = await getDocs(q);
    return snap.docs.slice(0, max).map(d => ({ uid: d.id, ...d.data() }));
  }
