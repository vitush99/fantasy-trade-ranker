import { doc, getDoc } from 'firebase/firestore';
import { db } from '@myfirebase';
import { fetchPlayerMap, PlayerInfo } from '@/data/dataloader';

export type { PlayerInfo }; // ✅ ADD THIS LINE

export async function getMergedPlayerMap(): Promise<Record<string, PlayerInfo>> {
  const baseMap = await fetchPlayerMap(); // headshotUrl only
  const snap = await getDoc(doc(db, 'rankings', 'sf'));

  const data = snap.exists() ? snap.data().players ?? [] : [];

  const enriched: Record<string, PlayerInfo> = {};
  for (const p of data) {
    enriched[p.name] = {
      headshotUrl: baseMap[p.name]?.headshotUrl ?? '',
      position: p.position ?? 'N/A',
      team: p.team ?? 'FA',
    };
  }

  return enriched;
}
