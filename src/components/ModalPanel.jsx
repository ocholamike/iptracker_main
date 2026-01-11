// src/components/ModalPanel.jsx
import React, { useEffect } from "react";

/**
 * Simple right-side modal panel wrapper (not browser modal).
 * Renders content inside a white panel with a close button.
 */
export default function ModalPanel({ title, onClose, children, overlay = false }) {  // When overlay is open, lock document scrolling so background (sidebar) does not move
  useEffect(() => {
    if (!overlay) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [overlay]);
  // overlay=false: inline responsive panel (non-floating)
  if (!overlay) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow w-full max-w-screen-xl mx-auto overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            className="text-sm text-gray-600 hover:text-gray-900"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div>{children}</div>
      </div>
    );
  }

  // overlay=true: floating modal overlay (used for admin edit)
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30 p-4" style={{ zIndex: 12000 }}>
      <div className="bg-white p-6 rounded-2xl shadow w-full max-w-screen-lg overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            className="text-sm text-gray-600 hover:text-gray-900"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
