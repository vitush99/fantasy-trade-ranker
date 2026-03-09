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
exports.onFollowingDelete = exports.onFollowingCreate = void 0;
// mobile/functions/src/social/triggers.ts
const fs = __importStar(require("firebase-functions/v2/firestore"));
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
// When I follow someone (doc created under /users/{uid}/following/{targetUid})
exports.onFollowingCreate = fs.onDocumentCreated('users/{uid}/following/{targetUid}', async (event) => {
    const { uid, targetUid } = event.params;
    // bump counters defensively
    await Promise.all([
        db.doc(`users/${uid}`).update({ 'stats.following': firestore_1.FieldValue.increment(1) })
            .catch(() => { }),
        db.doc(`users/${targetUid}`).update({ 'stats.followers': firestore_1.FieldValue.increment(1) })
            .catch(() => { }),
        // mirror follower doc if somehow missing
        db.doc(`users/${targetUid}/followers/${uid}`).set({ uid, followedAt: new Date() }, { merge: true }),
    ]);
    // optional: create mutual friends if target also follows me
    const back = await db.doc(`users/${targetUid}/following/${uid}`).get();
    if (back.exists) {
        await Promise.all([
            db.doc(`users/${uid}/friends/${targetUid}`).set({ since: new Date() }),
            db.doc(`users/${targetUid}/friends/${uid}`).set({ since: new Date() }),
        ]);
    }
});
// When I unfollow (doc deleted under /users/{uid}/following/{targetUid})
exports.onFollowingDelete = fs.onDocumentDeleted('users/{uid}/following/{targetUid}', async (event) => {
    const { uid, targetUid } = event.params;
    await Promise.all([
        db.doc(`users/${uid}`).update({ 'stats.following': firestore_1.FieldValue.increment(-1) })
            .catch(() => { }),
        db.doc(`users/${targetUid}`).update({ 'stats.followers': firestore_1.FieldValue.increment(-1) })
            .catch(() => { }),
        db.doc(`users/${targetUid}/followers/${uid}`).delete().catch(() => { }),
        // remove mutual friends
        db.doc(`users/${uid}/friends/${targetUid}`).delete().catch(() => { }),
        db.doc(`users/${targetUid}/friends/${uid}`).delete().catch(() => { }),
    ]);
});
