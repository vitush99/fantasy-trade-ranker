"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillUserSearch = void 0;
const https = __importStar(require("firebase-functions/v2/https"));
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
/**
 * Callable: backfillUserSearch (no auth required)
 * Args: { cursor?: string, batchSize?: number }
 */
exports.backfillUserSearch = https.onCall(async (req) => {
    const { cursor, batchSize = 500 } = (req.data || {});
    const usersCol = db.collection('users');
    let q = usersCol.orderBy(firestore_1.FieldPath.documentId()).limit(batchSize);
    if (cursor)
        q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty)
        return { updated: 0, scanned: 0, nextCursor: null };
    let updated = 0;
    const batch = db.batch();
    for (const docSnap of snap.docs) {
        const d = docSnap.data() || {};
        const username = (d.username ?? '').toString();
        const want = username.toLowerCase();
        const have = (d.search?.username_lower ?? '').toString();
        if (want && want !== have) {
            batch.set(docSnap.ref, { search: { username_lower: want } }, { merge: true });
            updated++;
        }
    }
    if (updated > 0)
        await batch.commit();
    const lastId = snap.docs[snap.docs.length - 1].id;
    return { updated, scanned: snap.size, nextCursor: lastId };
});
