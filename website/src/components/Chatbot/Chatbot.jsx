import React, { useEffect, useState } from 'react';
import './Chatbot.css';
import { MessageCircle, X } from 'lucide-react';
import api from '../../api';
import { useNavigate } from 'react-router-dom';

const Chatbot = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('sarga_chat') || '[]');
    } catch (e) {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    sessionStorage.setItem('sarga_chat', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) {
      const greet = { role: 'bot', text: "Hi! I'm Sarga's assistant. How can I help you today? 😊", timestamp: new Date().toISOString() };
      setMessages([greet]);
    }
  }, []);

  // When the chat panel opens, preload history (DB or file-backed) for this UUID
  useEffect(() => {
    if (!open) return;

    const loadHistory = async () => {
      try {
        const uuid = localStorage.getItem('sarga_uuid');
        const qs = uuid ? `?uuid=${encodeURIComponent(uuid)}&limit=100` : '?limit=100';
        const res = await api.get(`/website/chat/history${qs}`);
        const rows = res.data.history || [];
        if (!rows.length) return;

        // Only replace messages if there is no existing conversation (or only greeting)
        if (messages.length <= 1) {
          // rows are returned newest-first; reverse to chronological order
          const chronological = rows.slice().reverse();
          const loaded = [];
          chronological.forEach((r) => {
            if (r.user_message) loaded.push({ role: 'user', text: r.user_message, timestamp: r.created_at });
            if (r.bot_response) loaded.push({ role: 'bot', text: r.bot_response, timestamp: r.created_at });
          });
          if (loaded.length) setMessages(loaded);
        }
      } catch (err) {
        // Non-fatal: history may be unavailable; continue with session greeting
        // eslint-disable-next-line no-console
        console.warn('[Chatbot] Failed to load chat history:', err && err.message ? err.message : err);
      }
    };

    loadHistory();
  }, [open]);

  const sendMessage = async (text) => {
    if (!text || !text.trim()) return;
    const userMsg = { role: 'user', text, timestamp: new Date().toISOString() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setTyping(true);

    try {
      const res = await api.post('/website/chat', { message: text });
      const botMsg = { role: 'bot', text: res.data.reply, timestamp: new Date().toISOString(), meta: { source: res.data.source } };
      // mimic typing delay
      setTimeout(() => {
        setMessages((m) => [...m, botMsg]);
        setTyping(false);
      }, 500);
    } catch (err) {
      const botMsg = { role: 'bot', text: "Sorry, I'm having trouble connecting. Please call us directly.", timestamp: new Date().toISOString() };
      setMessages((m) => [...m, botMsg]);
      setTyping(false);
    }
  };

  const quickReply = (text) => {
    if (text === 'Track Order') {
      navigate('/track');
      setOpen(false);
      return;
    }
    if (text === 'Get a Quote') {
      navigate('/contact');
      setOpen(false);
      return;
    }
    sendMessage(text);
  };

  // Safely render message text without allowing raw HTML injection.
  // Supports simple **bold** markers and preserves newlines.
  const decodeHtmlEntities = (str) => {
    if (str == null) return '';
    try {
      if (typeof document !== 'undefined') {
        const txt = document.createElement('textarea');
        txt.innerHTML = String(str);
        return txt.value;
      }
    } catch (e) {
      // fallthrough to manual decode
    }
    return String(str)
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#039;|&apos;/g, "'");
  };

  const escapeHtml = (unsafe) => {
    if (!unsafe && unsafe !== '') return '';
    const decoded = decodeHtmlEntities(unsafe);
    return String(decoded)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;');
  };

  const renderMessageText = (text) => {
    if (text == null) return null;
    // Escape HTML first
    const escaped = escapeHtml(text);
    // Handle **bold** markup by splitting and creating nodes
    const parts = [];
    const boldRegex = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match;
    while ((match = boldRegex.exec(escaped)) !== null) {
      const idx = match.index;
      if (idx > lastIndex) parts.push(escaped.slice(lastIndex, idx));
      parts.push(<strong key={idx}>{match[1]}</strong>);
      lastIndex = idx + match[0].length;
    }
    if (lastIndex < escaped.length) parts.push(escaped.slice(lastIndex));

    // If no bold matches, parts will be single string; normalize to array
    const normalized = parts.length ? parts : [escaped];

    // Convert newlines to <br/> by splitting lines and inserting React elements
    return normalized.flatMap((segment, si) => {
      if (typeof segment === 'string') {
        const lines = segment.split(/\n/);
        return lines.map((ln, li) => (
          <span key={`${si}-${li}`}>{ln}{li < lines.length - 1 ? <br /> : null}</span>
        ));
      }
      // it's a React element (e.g., <strong>) — render and preserve newlines inside its text
      const childrenText = String(segment.props.children || '');
      const lines = childrenText.split(/\n/);
      return lines.map((ln, li) => (
        <span key={`${si}-${li}`}>{li === 0 ? segment : <>{ln}</>}{li < lines.length - 1 ? <br /> : null}</span>
      ));
    });
  };

  return (
    <div className={`sarga-chatbot ${open ? 'open' : ''}`}>
      <button className="chatbot-button" onClick={() => setOpen(!open)} aria-label="Open chat">
        <MessageCircle size={24} color="#fff" />
        {messages.filter(m => m.role === 'user').length === 0 && <span className="unread-dot" />}
      </button>

      {open && (
        <div className="chat-panel">
          <div className="chat-header">
            <div>
              <div className="chat-title">Sarga Prints</div>
              <div className="chat-sub">Typically replies instantly</div>
            </div>
            <button className="chat-close" onClick={() => setOpen(false)}><X size={18} /></button>
          </div>

          <div className="chat-body">
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role === 'user' ? 'user' : 'bot'}`}>
                <div className="chat-text">{renderMessageText(m.text)}</div>
                <div className="chat-time">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}

            {typing && (
              <div className="chat-bubble bot typing">
                <div className="typing-dots"><span></span><span></span><span></span></div>
              </div>
            )}
          </div>

          <div className="chat-footer">
            <div className="quick-replies">
              <button onClick={() => quickReply('Track Order')}>Track Order</button>
              <button onClick={() => quickReply('Get a Quote')}>Get a Quote</button>
              <button onClick={() => quickReply('Call Us')}>Call Us</button>
              <button onClick={() => quickReply('Our Services')}>Our Services</button>
            </div>

            <div className="input-row">
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message..." onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(input); }} />
              <button className="send-btn" onClick={() => sendMessage(input)}>Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chatbot;
