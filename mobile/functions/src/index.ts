// mobile/functions/src/index.ts
import * as admin from 'firebase-admin';

// Initialize Admin SDK once
if (!admin.apps.length) {
  admin.initializeApp();
}

// Export modules
export * from './social/follow';
export * from './social/triggers';
export * from './search/usersOnWrite';
// export * from './search/backfillUserSearch'; 