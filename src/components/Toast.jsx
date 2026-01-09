import React, { useEffect } from 'react';

export default function Toast({ message, type = 'info', onClose, duration = 3000 }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose && onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  let bg = 'bg-blue-500';
  if (type === 'error') bg = 'bg-red-500';
  else if (type === 'success') bg = 'bg-green-500';

  return (
    <div className={`fixed bottom-6 right-6 z-[99999] px-4 py-3 rounded shadow-lg text-white ${bg} animate-fade-in`}
         style={{ minWidth: 220 }}>
      <div className="flex items-center justify-between">
        <span>{message}</span>
        <button className="ml-4 text-white/80 hover:text-white" onClick={onClose}>×</button>
      </div>
    </div>
  );
  
}
