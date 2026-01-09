import { showToast } from './App';
// src/ChatBox.js
import React, { useEffect, useState, useRef } from 'react';
import { firestore, auth } from './firebaseConfig';
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  getDoc,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

import './ChatBox.css';

const generateConversationId = (u1, u2) => {
  if (!u1 || !u2) return null;
  return [u1, u2].sort().join('_');
};

function ChatBox({ conversationId: propConversationId, recipientId, onClose, userRole = 'customer' }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [recipientName, setRecipientName] = useState(null);
  const [recipientRole, setRecipientRole] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // keep current user id in sync with auth state
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUserId(u?.uid || null);
    });
    return () => unsub && unsub();
  }, []);

  // fetch recipient name for header
  useEffect(() => {
    if (!recipientId) { setRecipientName(null); setRecipientRole(null); return; }
    const fetchNameAndRole = async () => {
      try {
        const d = await getDoc(doc(firestore, 'users', recipientId));
        if (d.exists()) {
          const data = d.data();
          setRecipientName(data.name || data.fullName || recipientId);
          setRecipientRole(data.role || null);
        } else {
          setRecipientName(recipientId);
          setRecipientRole(null);
        }
      } catch (e) {
        console.warn('Failed to fetch recipient info', e);
        setRecipientName(recipientId);
        setRecipientRole(null);
      }
    };
    fetchNameAndRole();
  }, [recipientId]);

  // compute deterministic convId (override prop if inconsistent)
  const convId = generateConversationId(currentUserId, recipientId) || propConversationId;

  // messages collection reference uses the deterministic convId
  const messagesRefPath = convId ? collection(firestore, 'conversations', convId, 'messages') : null;

  useEffect(() => {
    if (!convId || !messagesRefPath) return;

    const q = query(messagesRefPath, orderBy('timestamp', 'asc'));

    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // attach a friendly senderName for received messages when available
      const enhanced = docs.map((d) => ({ ...d, senderName: d.senderId === currentUserId ? 'You' : (d.senderName || null) }));
      setMessages(enhanced);

      // compute unread count for this session (simple heuristic: messages where recipientId === currentUserId and not seen)
      if (currentUserId) {
        const unread = docs.filter(m => m.recipientId === currentUserId && (!m.seen || m.senderId !== currentUserId)).length;
        setUnreadCount(unread);
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, currentUserId]); // include currentUserId so we can compute unread count reliably

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!message.trim()) return;
    if (!currentUserId) { showToast('Not signed in', 'error'); return; }
    // ensure convId exists
    const finalConvId = generateConversationId(currentUserId, recipientId);
    if (!finalConvId) { showToast('Conversation id missing', 'error'); return; }

    const finalMessagesRef = collection(firestore, 'conversations', finalConvId, 'messages');

    await addDoc(finalMessagesRef, {
      text: message,
      senderId: currentUserId,
      recipientId,
      participants: [currentUserId, recipientId].sort(),
      timestamp: serverTimestamp(),
    });

    setMessage('');
  };

  const talkingTo = recipientName || (userRole === 'customer' ? 'Cleaner' : 'Customer');
  const talkingSubtitle = recipientRole ? `${recipientRole.charAt(0).toUpperCase()}${recipientRole.slice(1)}` : '';

  return (
    <div className="chatbox-container">
      {/* Header */}
      <div className="chatbox-header">
        <div>
          <span className="chat-title">💬 <strong>{talkingTo}</strong></span>
          {talkingSubtitle && <div className="chat-subtitle">{talkingSubtitle}</div>}
          {unreadCount > 0 && <span className="chat-unread"> {unreadCount} new</span>}
        </div>
        <button onClick={onClose} className="chatbox-close-button">✖</button>
      </div>

      {/* Messages */}
      <div className="chatbox-messages">
        {messages.map((msg, i) => {
          const isSender = msg.senderId === currentUserId;
          const otherName = recipientName || (userRole === 'customer' ? 'Cleaner' : 'Customer');
          const senderLabel = isSender ? 'You' : (msg.senderName || otherName);
          return (
            <div
              key={i}
              className={`chatbox-message-row ${isSender ? 'chatbox-message-sent' : 'chatbox-message-received'}`}
            >
              <div className="message-meta">
                <div className="message-sender">{senderLabel}</div>
              </div>

              <div className={`chatbox-message-bubble ${isSender ? 'sent' : 'received'}`}>
                <div className="message-text">{msg.text}</div>
                <div className="chatbox-message-timestamp">
                  {msg.timestamp?.toDate ? msg.timestamp?.toDate().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : ''}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chatbox-input-area">
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault(); // prevent newline
              sendMessage();
            }
          }}
          placeholder="Type a message..."
          className="chatbox-input"
          rows={1}
        />
        <button
          onClick={sendMessage}
          className="chatbox-send-button"
          title="Send"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default ChatBox;
