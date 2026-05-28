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
  const [quickOptions, setQuickOptions] = useState([]);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    sessionStorage.setItem('sarga_chat', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    // greet if empty
    if (messages.length === 0) {
      setMessages([{ role: 'bot', text: "Hi! I'm Sarga's assistant. How can I help you today? 😊", timestamp: new Date().toISOString() }]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const loadHistory = async () => {
      try {
        const uuid = localStorage.getItem('sarga_uuid');
        const qs = uuid ? `?uuid=${encodeURIComponent(uuid)}&limit=100` : '?limit=100';
        const res = await api.get(`/website/chat/history${qs}`);
        const rows = res.data.history || [];
        if (!rows.length) return;
        // load most recent messages (chronological)
        const chronological = rows.slice().reverse();
        const loaded = chronological.map(r => ({ role: r.user_message ? 'user' : 'bot', text: r.user_message || r.bot_reply || '', timestamp: r.created_at }));
        setMessages(loaded);
      } catch (e) {
        // ignore history errors
      }
    };
    loadHistory();
  }, [open]);

  const sendMessage = async (text) => {
    // Accept either a string or an object quick option
    let payloadText = text;
    if (text && typeof text === 'object') {
      // prefer label, fall back to payload.text or JSON
      payloadText = text.label || (text.payload && text.payload.text) || JSON.stringify(text);
    }
    if (!payloadText || !String(payloadText).trim()) return;
    const userMsg = { role: 'user', text: String(payloadText), timestamp: new Date().toISOString() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setTyping(true);

    try {
      const res = await api.post('/website/chat', { message: payloadText });
      const botReply = res?.data?.reply || "Sorry, I couldn't understand that.";
      const botMsg = { role: 'bot', text: botReply, timestamp: new Date().toISOString() };
      // Update quick options if provided
      if (res?.data?.categories) {
        setQuickOptions(res.data.categories.map((c, i) => ({ id: c.id || i, label: c.name, payload: c })));
      } else if (res?.data?.subcategories) {
        setQuickOptions(res.data.subcategories.map((s, i) => ({ id: s.id || i, label: s.name, payload: s })));
      } else {
        setQuickOptions([]);
      }

      setTimeout(() => {
        setMessages((m) => [...m, botMsg]);
        setTyping(false);
      }, 400);
    } catch (err) {
      setMessages((m) => [...m, { role: 'bot', text: "Sorry, I'm having trouble connecting. Please call us directly.", timestamp: new Date().toISOString() }]);
      setTyping(false);
    }
  };

  const quickReply = (opt) => {
    // opt may be a string or an object
    if (!opt) return;
    if (typeof opt === 'string') {
      if (opt === 'Track Order') { navigate('/track'); setOpen(false); return; }
      if (opt === 'Get a Quote') { navigate('/contact'); setOpen(false); return; }
      if (opt === 'Call Us') { window.location.href = 'tel:+919496XXXXX'; return; }
      sendMessage(opt);
      return;
    }
    // object
    sendMessage(opt);
  };

  const renderMessageText = (text) => {
    if (text == null) return null;
    const escaped = String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    // handle simple **bold**
    const parts = escaped.split(/\*\*(.+?)\*\*/g);
    return parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i} dangerouslySetInnerHTML={{ __html: p.replace(/\n/g, '<br/>') }} />));
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
              {quickOptions.length > 0 && (
                <div className="quick-options">
                  {quickOptions.map((opt) => (
                    <button key={opt.id} onClick={() => quickReply(opt)}>{opt.label}</button>
                  ))}
                </div>
              )}
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
