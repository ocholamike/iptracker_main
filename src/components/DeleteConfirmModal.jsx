import React from 'react';

export default function DeleteConfirmModal({ entityType, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30 p-4" style={{ zIndex: 12000 }}>
      <div className="bg-white p-6 rounded-2xl shadow w-full max-w-sm">
        <h2 className="text-xl font-semibold mb-4">Confirm Delete</h2>
        <p className="text-gray-700 mb-6">Are you sure you want to delete this {entityType}? This action cannot be undone.</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-white bg-red-600 rounded hover:bg-red-700 transition"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
