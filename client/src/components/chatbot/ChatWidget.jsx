import React, { useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const ChatWidget = React.memo(() => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const send = async () => {
    if (!input) return;
    const msg = { from: 'admin', text: input };
    setMessages(m => [...m, { ...msg, id: Date.now() }]);
    setInput('');
    try {
      const res = await api.post('chatbot/message', { message: input, session_id: 'admin-test', branch: 'perambra' });
      const data = res.data;
      setMessages(m => [...m, { id: Date.now()+1, from: 'bot', text: data.reply || '', meta: { intent: data.intent, confidence: data.confidence } }]);
    } catch (e) {
      toast.error('Chat failed');
    }
  };

  return (
    <div>
      <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 60 }}>
        {open && (
          <div className="card" style={{ width: 320, height: 420, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
              <strong>Chatbot Test</strong>
              <button className="btn btn-ghost btn-sm" style={{ float: 'right' }} onClick={() => setOpen(false)}>Close</button>
            </div>
            <div style={{ padding: 8, flex: 1, overflow: 'auto' }}>
              {messages.map(m => (
                <div key={m.id} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 13, color: m.from === 'bot' ? '#0b78e3' : 'var(--text)' }}>{m.text}</div>
                  {m.meta && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.meta.intent} • {m.meta.confidence}%</div>}
                </div>
              ))}
            </div>
            <div style={{ padding: 8, borderTop: '1px solid var(--border)' }}>
              <div className="row gap-sm">
                <input value={input} onChange={e => setInput(e.target.value)} placeholder="Send a test message" style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={send}>Send</button>
              </div>
            </div>
          </div>
        )}

        <button className="btn btn-primary btn-circle" onClick={() => setOpen(o => !o)} title="Chatbot test">
          🤖
        </button>
      </div>
    </div>
  );
});

export default ChatWidget;
