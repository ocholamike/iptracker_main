// src/components/ProfileForm.js
import React, { useEffect, useState } from "react";

import {
  getUserById,
  updateUser,
  createUserProfile
} from "../services/userService";

import { showToast } from "../App";
import { getCleanerRatings } from "../services/ratingService";
import { markProfileComplete } from "../services/userSessionService";
import { sendRecoveryLink } from "../services/authService";

import { database } from "../firebaseConfig";
import { ref as rtdbRef, get as rtdbGet, update as rtdbUpdate } from "firebase/database";

// Categories options
const CATEGORY_OPTIONS = [
  'General house cleaning',
  'Car cleaning',
  'Outdoor cleaning',
  'Window cleaning',
  'Carpet cleaning',
  'Deep cleaning',
  'Move-in/out cleaning',
  'Office cleaning',
  'Kitchen deep cleaning',
  'Laundry & ironing',
  'Garden / landscaping',
  'Pest control',
  'Upholstery cleaning',
  'Post-construction cleaning',
  'Sanitization & disinfection'
];


export default function ProfileForm({ user }) {
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [avgRating, setAvgRating] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [roleFromRTDB, setRoleFromRTDB] = useState("customer");
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [sendingRecovery, setSendingRecovery] = useState(false);
  useEffect(() => {
    if (user?.uid) loadProfileFromSession(user.uid);
  }, [user?.uid]);

  const loadProfileFromSession = async (uid) => {
    let firestoreData = await getUserById(uid);
    let rtdbData = {};

    try {
      const snap = await rtdbGet(rtdbRef(database, `locations`));
      rtdbData = snap.val() || {};
    } catch {}

    let rtdbUser = null;
    for (const key in rtdbData) {
      if (rtdbData[key].uid === uid) {
        rtdbUser = rtdbData[key];
        break;
      }
    }

    const role = rtdbUser?.role || firestoreData?.role || "customer";
    setRoleFromRTDB(role);

    let data = firestoreData || {
      uid,
      name: rtdbUser?.name || "",
      email: rtdbUser?.email || "",
      phone: rtdbUser?.phone || "",
      role,
      categories: []
    };

    if (data.category && !data.categories) {
      data.categories = Array.isArray(data.category)
        ? data.category
        : [data.category];
    }

    if (!firestoreData) await createUserProfile(data);

    setProfile(data);
    setSelectedCategories(data.categories || []);

    if (role === "cleaner") {
      const ratings = await getCleanerRatings(uid);
      const count = ratings.length;
      const avg = count
        ? ratings.reduce((s, r) => s + Number(r.rating || 0), 0) / count
        : 0;

      setAvgRating(avg);
      setRatingCount(count);
    }
  };

  const toggleCategory = (category) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const handleChange = (e) => {
    setProfile((p) => ({ ...p, [e.target.name]: e.target.value }));
  };

  const saveProfile = async () => {
    if (!profile) return;
    setSaving(true);

    try {
      const finalPatch = {
        ...profile,
        categories: selectedCategories,
        category: selectedCategories[0] || null
      };

      await updateUser(profile.uid, finalPatch);
      await markProfileComplete(profile.uid);
      setProfile(finalPatch);

      await loadProfileFromSession(profile.uid);
      setEditing(false);

      showToast?.("Profile saved", "success");
    } catch {
      alert("Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="max-w-md mx-auto mt-8 bg-white rounded shadow p-4">
        Loading profile…
      </div>
    );
  }

  return (
    <div className="relative max-w-md mx-auto mt-8 bg-white rounded shadow p-6">
      <h2 className="text-xl font-semibold text-center">
        {profile.name || "-"}
      </h2>

      {roleFromRTDB === "cleaner" && (
        <div className="mt-4">
          <div className="flex flex-col items-center gap-1 mt-1">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((star) => {
                const filled = avgRating >= star;
                const halfFilled = avgRating >= star - 0.5 && avgRating < star;

                return (
                  <span
                    key={star}
                    className={`text-xl ${
                      filled
                        ? "text-yellow-400"
                        : halfFilled
                        ? "text-yellow-300"
                        : "text-gray-300"
                    }`}
                  >
                    ★
                  </span>
                );
              })}
            </div>

            <div className="text-xs text-gray-600">
              {avgRating.toFixed(1)} ({ratingCount})
            </div>
          </div>


          {!editing && (
            <div className="mt-3">
              <p className="text-sm font-medium">Categories</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {profile.categories?.length ? (
                  profile.categories.map((c) => (
                    <span
                      key={c}
                      className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded"
                    >
                      {c}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-400 text-sm">
                    Not specified
                  </span>
                )}
              </div>
            </div>
          )}

          {editing && (
            <div className="relative mt-3">
              <button
                type="button"
                onClick={() => setShowCategoryDropdown((s) => !s)}
                className="w-full border rounded px-3 py-2 text-left"
              >
                Select categories
              </button>

              {showCategoryDropdown && (
                <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-white border rounded shadow-lg">
                  {CATEGORY_OPTIONS.map((opt) => (
                    <label
                      key={opt}
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(opt)}
                        onChange={() => toggleCategory(opt)}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-2">
                {selectedCategories.map((c) => (
                  <span
                    key={c}
                    className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {!editing && (
          <>
            <p><strong>Email:</strong> {profile.email || "-"}</p>
            <p><strong>Phone:</strong> {profile.phone || "-"}</p>

            <button
              onClick={() => setEditing(true)}
              className="w-full bg-blue-600 text-white py-2 rounded"
            >
              Edit Profile
            </button>
          </>
        )}

        {editing && (
          <>
            <input
              name="name"
              value={profile.name}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
              placeholder="Name"
            />

            <input
              name="email"
              value={profile.email}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
              placeholder="Email"
            />

            <input
              name="phone"
              value={profile.phone}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
              placeholder="Phone"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>

              <button
                onClick={saveProfile}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}
      </div>
      <div className="mt-6 border-t pt-4">
        <h4 className="text-sm font-semibold text-gray-700">
          Recover existing account
        </h4>

        <input
          type="email"
          value={recoveryEmail}
          onChange={(e) => setRecoveryEmail(e.target.value)}
          className="w-full border rounded px-3 py-2 mt-2"
          placeholder="Enter email used before"
        />

        <button
          disabled={sendingRecovery}
          onClick={async () => {
            try {
              setSendingRecovery(true);
              await sendRecoveryLink(recoveryEmail);
              showToast("Recovery link sent to email", "success");
            } catch {
              showToast("Failed to send recovery link", "error");
            } finally {
              setSendingRecovery(false);
            }
          }}
          className="mt-2 w-full bg-gray-700 text-white py-2 rounded"
        >
          {sendingRecovery ? "Sending…" : "Recover Account"}
        </button>
      </div>

    </div>
  );
}
