// helpers/savePersonalizedRankings.ts
import { getAuth } from 'firebase/auth';
import {
  collection,
  getDocs,
  setDoc,
  doc
} from 'firebase/firestore';
import { db } from '@myfirebase';
import { fetchRankings } from '@/data/dataloader';
import { getPersonalizedRankings } from '@engine';
import type { StoredSwipe, Player } from '@engine';

export const savePersonalizedRankingsToFirestore = async (format: 'sf' | '1qb') => {
  try {
    const user = getAuth().currentUser;
    if (!user) return;

    // 1. Fetch base rankings
    const baseRankings: Player[] = await fetchRankings(format);

    // 2. Fetch swipe history
    const snap = await getDocs(collection(db, 'users', user.uid, 'swipes'));
    const swipes: StoredSwipe[] = snap.docs.map((doc) => doc.data() as StoredSwipe);

    // 3. Compute personalized rankings
    const personalized = getPersonalizedRankings(baseRankings, swipes);

    // 4. Save to Firestore under /users/{uid}/rankings/{format}
    const rankingRef = doc(db, 'users', user.uid, 'rankings', format);
    await setDoc(rankingRef, {
      updatedAt: new Date().toISOString(),
      players: personalized,
    });
  } catch (err) {
  }
};
