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
exports.unfollowUser = exports.followUser = void 0;
// mobile/functions/src/social/follow.ts
const https = __importStar(require("firebase-functions/v2/https"));
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
exports.followUser = https.onCall(async (req) => {
    const uid = req.auth?.uid;
    const { targetUid } = (req.data || {});
    if (!uid)
        throw new https.HttpsError('unauthenticated', 'Login required');
    if (!targetUid || targetUid === uid) {
        throw new https.HttpsError('invalid-argument', 'Invalid target user');
    }
    const meRef = db.doc(`users/${uid}`);
    const targetRef = db.doc(`users/${targetUid}`);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists)
        throw new https.HttpsError('not-found', 'User not found');
    const followingRef = meRef.collection('following').doc(targetUid);
    const followerRef = targetRef.collection('followers').doc(uid);
    // idempotent
    if ((await followingRef.get()).exists)
        return { ok: true };
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
exports.unfollowUser = https.onCall(async (req) => {
    const uid = req.auth?.uid;
    const { targetUid } = (req.data || {});
    if (!uid)
        throw new https.HttpsError('unauthenticated', 'Login required');
    if (!targetUid || targetUid === uid) {
        throw new https.HttpsError('invalid-argument', 'Invalid target user');
    }
    const meRef = db.doc(`users/${uid}`);
    const targetRef = db.doc(`users/${targetUid}`);
    const followingRef = meRef.collection('following').doc(targetUid);
    const followerRef = targetRef.collection('followers').doc(uid);
    await db.runTransaction(async (trx) => {
        trx.delete(followingRef);
        trx.delete(followerRef);
    });
    return { ok: true };
});
