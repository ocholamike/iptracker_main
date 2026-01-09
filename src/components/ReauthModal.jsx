import React, { useState, useEffect } from 'react';
import ModalPanel from './ModalPanel';

export default function ReauthModal({ open, email = '', onClose, onConfirm }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setPassword('');
  }, [open]);

  const submit = async () => {
    setLoading(true);
    try {
      await onConfirm(password);
    } catch (err) {
      // let caller handle errors
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;
  return (
    <ModalPanel title="Confirm password" onClose={onClose} overlay={true}>
      <div className="p-4">
        <div className="text-sm text-gray-600 mb-2">To continue editing the admin account ({email}), please confirm your current password.</div>
        <div className="mb-3">
          <input
            autoFocus
            type="password"
            className="w-full border p-2 rounded"
            placeholder="Current password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1 bg-blue-500 text-white rounded" onClick={submit} disabled={loading}>{loading ? 'Confirming…' : 'Confirm'}</button>
          <button className="px-3 py-1 bg-gray-200 rounded" onClick={onClose} disabled={loading}>Cancel</button>
        </div>
      </div>
    </ModalPanel>
  );
}
