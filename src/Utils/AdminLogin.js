import { showToast } from '../App';
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, firestore } from "../firebaseConfig";
import { signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { setDoc, doc, getDoc } from "firebase/firestore";
import { createAdminProfile, getAdminProfile, findAdminProfileByAuthUid, findAdminProfileByEmail } from "../services/adminService"; 

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    try {
      const fixedDocId = "superAdmin"; // KEEP existing Firestore admin doc id for backwards compatibility

      // NOTE: Initial superadmin credentials (for first-time Firebase setup)
      // Email: superadmin@gmail.com
      // Password: super123456
      // These are only used to bootstrap the Firebase Auth user on first creation.

      const profile = await getAdminProfile(fixedDocId);

      // If no admin profile exists in Firestore yet, create the initial superadmin user
      if (!profile) {
        try {
          // Create Firebase Auth user with the documented credentials
          const created = await createUserWithEmailAndPassword(auth, 'superadmin@gmail.com', '$super#123456');
          const authUid = created.user.uid;
          // Create Firestore profile doc at fixedDocId with legacy fields (for backwards compat)
          await createAdminProfile({
            uid: fixedDocId,
            username: 'superadmin',
            password: 'super123456',
            meta: { email: 'superadmin@gmail.com', authUid }
          });
          if (typeof showToast === 'function') showToast('SuperAdmin created. Please sign in using your email or username.', 'success');
        } catch (e) {
          console.warn('Firebase Auth user creation may have already happened:', e?.message || e);
          // Still create Firestore profile as fallback (in case user already exists in Auth)
          await createAdminProfile({
            uid: fixedDocId,
            username: 'superadmin',
            password: 'super123456',
            meta: { email: 'superadmin@gmail.com' }
          });
          if (typeof showToast === 'function') showToast('SuperAdmin profile created.', 'success');
        }
        return;
      }

      // ==== LOGIN ATTEMPT ====
      // Trim inputs and check if looks like an email (contains @)
      const input = (username || '').trim();
      const pwd = password || '';
      const isEmail = input.includes('@');

      if (isEmail) {
        // Try Firebase email/password authentication
        try {
          const cred = await signInWithEmailAndPassword(auth, input, pwd);
          const sessionUid = cred.user.uid;

          // Locate a matching admin profile by auth UID or by email
          let adminDoc = await getAdminProfile(sessionUid);
          if (!adminDoc) adminDoc = await findAdminProfileByAuthUid(sessionUid);
          if (!adminDoc) adminDoc = await findAdminProfileByEmail(input);

          // If no admin profile exists, create one keyed by the auth UID
          if (!adminDoc) {
            const usernameHint = input.split('@')[0];
            const created = await createAdminProfile({ uid: sessionUid, username: usernameHint, password: '', meta: { email: input, authUid: sessionUid } });
            adminDoc = { id: sessionUid, ...created };
            if (typeof showToast === 'function') showToast('Admin account created for this email.', 'success');
          }

          // Create admin session record (include adminDocId)
          await setDoc(doc(firestore, 'adminSessions', sessionUid), {
            uid: sessionUid,
            isAdmin: true,
            adminDocId: adminDoc.id,
            loggedInAt: new Date()
          });

          // Persist state for dashboard resolution
          localStorage.setItem('isAdmin', 'true');
          localStorage.setItem('adminUid', adminDoc.id);

          navigate('/admin_dashboard');
          return;
        } catch (e) {
          // Helpful debug logging for diagnosis
          console.error('Email signin failed:', { code: e?.code, message: e?.message, stack: e?.stack });
          if (typeof showToast === 'function') showToast('Email login failed: ' + (e?.code || e?.message || 'Invalid credentials'), 'error');
          return;
        }
      }

      // Fallback: Legacy username/password authentication (stored in Firestore)
      // This allows existing users (like your colleague with username="admin") to keep logging in
      if (username !== profile.username || password !== profile.password) {
        if (typeof showToast === 'function') showToast('Incorrect username or password', 'error');
        return;
      }

      // Anonymous session for legacy username/password login
      const userCredential = await signInAnonymously(auth);
      const sessionUid = userCredential.user.uid;
      await setDoc(doc(firestore, 'adminSessions', sessionUid), {
        uid: sessionUid,
        isAdmin: true,
        adminDocId: fixedDocId,
        loggedInAt: new Date()
      });
      // Persist state so dashboard can find the Firestore admin doc
      localStorage.setItem('isAdmin', 'true');
      localStorage.setItem('adminUid', fixedDocId);
      navigate('/admin_dashboard');

    } catch (err) {
      console.error("Admin login error:", err);
      if (typeof showToast === 'function') showToast('Login failed', 'error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-200">
      <div className="bg-white p-6 shadow-lg rounded w-full max-w-sm">
        <h2 className="text-xl font-bold mb-4">Admin Login</h2>

        <input
          className="w-full border p-2 rounded mb-3"
          placeholder="Admin Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          className="w-full border p-2 rounded mb-3"
          type="password"
          placeholder="Admin Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          className="w-full py-2 bg-orange-600 text-white rounded"
          onClick={handleLogin}
        >
          Login
        </button>
      </div>
    </div>
  );
}
