import React, { useEffect } from 'react';
import InfoIcon from '@mui/icons-material/Info';
import ErrorIcon from '@mui/icons-material/Error';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

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
  let Icon = InfoIcon;
  if (type === 'error') { bg = 'bg-red-600'; Icon = ErrorIcon; }
  else if (type === 'success') { bg = 'bg-green-600'; Icon = CheckCircleIcon; }

  return (
    <div className={`fixed bottom-6 right-6 z-[99999] px-4 py-3 rounded-lg shadow-xl text-white ${bg} animate-fade-in`} style={{ minWidth: 260 }}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
          <Icon fontSize="small" />
        </div>
        <div className="flex-1">
          <div className="font-medium">{message}</div>
        </div>
        <button className="ml-3 text-white/90 hover:text-white" onClick={onClose}>×</button>
      </div>
    </div>
  );
}
