import * as fs from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

// Keep only username-based search
export const onUserWrite = fs.onDocumentWritten('users/{uid}', async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return;

  const data = after.data() ?? {};
  const username = String((data as any).username ?? '');
  const username_lower = username.toLowerCase();

  await db.doc(after.ref.path).set(
    { search: { username_lower } },
    { merge: true }
  );
});
