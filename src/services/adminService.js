// src/services/adminService.js
import { firestore as db } from "../firebaseConfig";
import { doc, setDoc, getDoc, serverTimestamp, updateDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore"; 

// Helper: find admin profile by Firebase Auth UID stored in meta.authUid
export async function findAdminProfileByAuthUid(authUid) {
  if (!authUid) return null;
  const q = query(collection(db, "adminAuth"), where("meta.authUid", "==", authUid));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  }
  return null;
}

// Helper: find admin profile by email stored in meta.email
export async function findAdminProfileByEmail(email) {
  if (!email) return null;
  const q = query(collection(db, "adminAuth"), where("meta.email", "==", email));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  }
  return null;
}

/**
 * Admin Service
 * Handles CRUD operations for admin profiles in Firestore (collection: adminAuth)
 */

/**
 * Create or update an admin profile
 * @param {Object} params
 * @param {string} params.uid - Firebase Auth UID of the admin
 * @param {string} params.username - Admin username
 * @param {string} params.password - Admin password (store carefully!)
 * @param {string} [params.role="admin"] - Role of the admin
 * @param {Object} [params.meta={}] - Optional metadata
 * @returns {Promise<Object>} The payload that was written to Firestore
 */
export async function createAdminProfile({ uid, username, password, role = "admin", meta = {} }) {
  if (!uid) throw new Error("uid is required");

  const adminRef = doc(db, "adminAuth", uid);

  const payload = {
    uid,
    username,
    password,
    role,
    createdAt: serverTimestamp(),
    meta,
  };

  // Merge true ensures existing data is not overwritten
  await setDoc(adminRef, payload, { merge: true });
  return payload;
}

/**
 * Update an admin profile (partial update)
 */
export async function updateAdminProfile(uid, data = {}) {
  if (!uid) throw new Error("uid is required");
  const adminRef = doc(db, "adminAuth", uid);
  const patch = { ...data, updatedAt: serverTimestamp() };
  await updateDoc(adminRef, patch);
  return true;
}

/**
 * Fetch an admin profile by UID
 * @param {string} uid - Firebase Auth UID of the admin
 * @returns {Promise<Object|null>} Admin profile if exists, else null
 */
export async function getAdminProfile(uid) {
  if (!uid) throw new Error("uid is required");

  const snap = await getDoc(doc(db, "adminAuth", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Optional: Delete admin profile
 * @param {string} uid - UID of the admin to delete
 * @returns {Promise<void>}
 */
export async function deleteAdminProfile(uid) {
  if (!uid) throw new Error("uid is required");

  await deleteDoc(doc(db, "adminAuth", uid));
}
