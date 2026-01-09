// src/components/CleanerDetailModal.jsx
import React from "react";

export default function CleanerDetailModal({ cleaner, onClose }) {
  if (!cleaner) return null;

  const ratingValue = Number(cleaner.averageRating ?? 0);
  const ratingCount = Number(cleaner.ratingCount ?? 0);

  const categories = Array.isArray(cleaner.categories)
    ? cleaner.categories
    : [];

  return (
    <div className="bg-white p-4 rounded-2xl w-full max-w-5xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        <div className="bg-gray-50 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase">
            Profile
          </h3>

          <div className="space-y-2 text-sm text-gray-700">
            <p><b>Name:</b> {cleaner.name || "—"}</p>
            <p><b>Email:</b> {cleaner.email || "—"}</p>
            <p><b>Phone:</b> {cleaner.phone || "—"}</p>

            <p>
              <b>Categories:</b>{" "}
              {categories.length ? categories.join(", ") : "—"}
            </p>

            <p>
              <b>Status:</b>{" "}
              {cleaner.status
                ? <span className="capitalize">{cleaner.status}</span>
                : "—"}
            </p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase">
            Performance
          </h3>

          <div className="flex items-center mb-3">
            {Array.from({ length: 5 }).map((_, i) => {
              const star = i + 1;
              return (
                <span
                  key={i}
                  className={`text-xl ${
                    ratingValue >= star
                      ? "text-yellow-400"
                      : ratingValue >= star - 0.5
                        ? "text-yellow-400 opacity-60"
                        : "text-gray-300"
                  }`}
                >
                  ★
                </span>
              );
            })}

            <span className="ml-2 text-sm text-gray-700">
              {ratingCount
                ? `${ratingValue.toFixed(1)} (${ratingCount})`
                : "No ratings"}
            </span>
          </div>

          <p className="text-sm text-gray-700">
            <b>Jobs Completed:</b> {cleaner.completedJobs ?? 0}
          </p>

          <p className="text-sm text-gray-700">
            <b>Total Earnings:</b>{" "}
            {cleaner.totalEarnings != null
              ? `Ksh ${Number(cleaner.totalEarnings).toLocaleString("en-KE")}`
              : "—"}
          </p>
        </div>

      </div>
    </div>
  );
}
