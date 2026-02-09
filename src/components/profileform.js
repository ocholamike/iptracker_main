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

    const role = rtdbUser?.role || firestoreData?.role || null;
    setRoleFromRTDB(role || "customer");

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
      <div className="w-full max-w-xl mx-auto p-3 sm:p-4">
        <div className="bg-white rounded-lg shadow-sm p-6 text-center">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <p className="mt-3 text-sm text-gray-600">Loading your profile…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto p-3 sm:p-4 py-8 sm:py-12">
      <div className="bg-transparent rounded-lg shadow-sm overflow-y-auto" style={{ maxHeight: 'calc(100vh - 60px)' }}>
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4 sm:px-6">
          <h1 className="text-xl sm:text-2xl font-bold text-white">
            {profile.name || "Profile"}
          </h1>
          <p className="text-blue-100 text-xs sm:text-sm mt-1">
            {roleFromRTDB === "cleaner" ? "Service Provider" : roleFromRTDB === "customer" ? "Customer" : "User"} Account
          </p>
        </div>

        {/* Cleaner Stats */}
        {roleFromRTDB === "cleaner" && (
          <div className="px-5 py-3 sm:px-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-transparent">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-gray-600">Your Rating</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const filled = avgRating >= star;
                      const halfFilled = avgRating >= star - 0.5 && avgRating < star;
                      return (
                        <span
                          key={star}
                          className={`text-lg ${
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
                  <div className="text-sm font-semibold text-gray-800">
                    {avgRating.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-600">
                    ({ratingCount} {ratingCount === 1 ? "review" : "reviews"})
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="px-5 py-4 sm:px-6">
          {!editing ? (
            // View Mode
            <div className="space-y-4">
              {/* Profile Info Display */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Full Name
                  </label>
                  <p className="text-sm text-gray-900 bg-gray-50 rounded px-3 py-2">
                    {profile.name || "Not provided"}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Email Address
                  </label>
                  <p className="text-sm text-gray-900 bg-gray-50 rounded px-3 py-2 break-all">
                    {profile.email || "Not provided"}
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <p className="text-sm text-gray-900 bg-gray-50 rounded px-3 py-2">
                    {profile.phone || "Not provided"}
                  </p>
                </div>
              </div>

              {/* Cleaner Categories */}
              {roleFromRTDB === "cleaner" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
                    Service Categories
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {profile.categories?.length ? (
                      profile.categories.map((c) => (
                        <span
                          key={c}
                          className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full"
                        >
                          {c}
                        </span>
                      ))
                    ) : (
                      <p className="text-gray-500 text-xs">No categories selected yet</p>
                    )}
                  </div>
                </div>
              )}

              {/* Edit Button */}
              <button
                onClick={() => setEditing(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 rounded-lg transition duration-200 shadow-sm"
              >
                Edit Profile
              </button>
            </div>
          ) : (
            // Edit Mode
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveProfile(); }}>
              {/* Name Field */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="name"
                  type="text"
                  value={profile.name}
                  onChange={handleChange}
                  placeholder="Enter your full name"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
                <p className="text-xs text-gray-500 mt-0.5">Used to identify you to customers</p>
              </div>

              {/* Email Field */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  name="email"
                  type="email"
                  value={profile.email}
                  onChange={handleChange}
                  placeholder="your.email@example.com"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
                <p className="text-xs text-gray-500 mt-0.5">We'll use this to send you important updates</p>
              </div>

              {/* Phone Field */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  name="phone"
                  type="tel"
                  value={profile.phone}
                  onChange={handleChange}
                  placeholder="+1 (555) 123-4567"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
                <p className="text-xs text-gray-500 mt-0.5">Customers will use this to contact you</p>
              </div>

              {/* Cleaner Categories */}
              {roleFromRTDB === "cleaner" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
                    Service Categories
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowCategoryDropdown((s) => !s)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-left bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    >
                      <span className={selectedCategories.length === 0 ? "text-gray-500" : "text-gray-900"}>
                        {selectedCategories.length === 0
                          ? "Select services you provide"
                          : `${selectedCategories.length} categor${selectedCategories.length === 1 ? "y" : "ies"} selected`}
                      </span>
                    </button>

                    {showCategoryDropdown && (
                      <div className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-lg">
                        {CATEGORY_OPTIONS.map((opt, idx) => (
                          <label
                            key={opt}
                            className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                          >
                            <input
                              type="checkbox"
                              checked={selectedCategories.includes(opt)}
                              onChange={() => toggleCategory(opt)}
                              className="w-3 h-3 rounded border-gray-300 text-blue-600 cursor-pointer"
                            />
                            <span className="text-gray-700">{opt}</span>
                          </label>
                        ))}
                        <div className="px-3 py-1.5 text-xs text-gray-400 text-center border-t border-gray-100 bg-gray-50">
                          ↓ End of list
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedCategories.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {selectedCategories.map((c) => (
                        <span
                          key={c}
                          className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1"
                        >
                          {c}
                          <button
                            type="button"
                            onClick={() => toggleCategory(c)}
                            className="ml-0.5 text-blue-600 hover:text-blue-800 font-bold"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg transition"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Account Recovery Section */}
        <div className="px-5 py-3 sm:px-6 bg-gray-50 border-t border-gray-200">
          <h3 className="text-xs font-semibold text-gray-900 mb-2">
            Recover an Existing Account
          </h3>
          <p className="text-xs text-gray-600 mb-3">
            If you've used this email before, we can help you recover your previous account
          </p>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={recoveryEmail}
              onChange={(e) => setRecoveryEmail(e.target.value)}
              placeholder="Enter your previous email address"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />

            <button
              disabled={sendingRecovery}
              onClick={async () => {
                if (!recoveryEmail) {
                  showToast("Please enter an email address", "error");
                  return;
                }
                try {
                  setSendingRecovery(true);
                  await sendRecoveryLink(recoveryEmail);
                  showToast("Recovery link sent to your email", "success");
                  setRecoveryEmail("");
                } catch {
                  showToast("Failed to send recovery link. Please try again.", "error");
                } finally {
                  setSendingRecovery(false);
                }
              }}
              className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-800 disabled:bg-gray-500 text-white font-semibold rounded-lg transition whitespace-nowrap"
            >
              {sendingRecovery ? "Sending…" : "Send Link"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
