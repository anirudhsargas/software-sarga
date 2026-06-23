import React, { useEffect, useState, useCallback, useMemo } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Brain } from 'lucide-react';
import EmptyState from '../../components/EmptyState';
import SkeletonLoader from '../../components/SkeletonLoader';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import ChatWidget from '../../components/chatbot/ChatWidget';
import PageContainer from '../../components/ui/PageContainer';

const INTENTS = [
  'order_status','price_enquiry','delivery_query','reorder','complaint','payment_query','branch_info','general_greeting','other'
];

const ChatbotTraining = () => {
  const [tab, setTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [modelMeta, setModelMeta] = useState(null);
  const [unlabeledCount, setUnlabeledCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [intentDist, setIntentDist] = useState([]);
  const [retraining, setRetraining] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [chartReady, setChartReady] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setChartReady(true));
  }, []);

  const [messages, setMessages] = useState([]);
  const [labeledToday, setLabeledToday] = useState(0);

  const [trainingExamples, setTrainingExamples] = useState([]);
  const [trainingPage, setTrainingPage] = useState(1);
  const [trainingLimit, setTrainingLimit] = useState(20);
  const [trainingTotal, setTrainingTotal] = useState(0);
  const [trainingQuery, setTrainingQuery] = useState('');
  const [modelVersions, setModelVersions] = useState([]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('chatbot/model-status', { skipGlobalErrorHandling: true });
      const data = res.data;
      setModelMeta(data.meta || {});
      setUnlabeledCount(data.unlabeled || 0);
      setPendingCount(data.pending || 0);
      setIsOffline(data.healthy === false);
    } catch {
      setIsOffline(true);
    }
  }, []);

  const fetchIntentDistribution = useCallback(async () => {
    try {
      // fetch larger page to compute distribution
      const res = await api.get('chatbot/training-examples', { params: { limit: 1000 }, skipGlobalErrorHandling: true });
      const rows = res.data.rows || [];
      const map = {};
      rows.forEach(r => map[r.intent] = (map[r.intent]||0)+1);
      const chart = INTENTS.map(i => ({ intent: i, count: map[i] || 0 }));
      setIntentDist(chart);
    } catch {
      // silently ignore
    }
  }, []);

  const fetchTrainingExamples = useCallback(async (page = 1, limit = 20, q = '') => {
    try {
      const res = await api.get('chatbot/training-examples', { params: { page, limit, q }, skipGlobalErrorHandling: true });
      const data = res.data || {};
      setTrainingExamples(data.rows || []);
      setTrainingPage(data.page || page);
      setTrainingLimit(data.limit || limit);
      setTrainingTotal(data.total || 0);
    } catch {
      toast.error('Failed to fetch training examples');
    }
  }, []);

  const fetchUnlabeled = useCallback(async () => {
    try {
      const res = await api.get('chatbot/logs', { params: { labeled: false, limit: 20 }, skipGlobalErrorHandling: true });
      setMessages(res.data.rows || []);
    } catch {
      toast.error('Failed to fetch messages');
    }
  }, []);

  const fetchModelVersions = useCallback(async () => {
    try {
      const res = await api.get('chatbot/model-versions', { skipGlobalErrorHandling: true });
      setModelVersions(res.data.rows || []);
    } catch {}
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchStatus(), fetchIntentDistribution(), fetchUnlabeled(), fetchModelVersions(), fetchTrainingExamples(trainingPage, trainingLimit, trainingQuery)]);
      if (mounted) setLoading(false);
    };
    load();
    const iv = setInterval(fetchStatus, 30000);
    return () => { mounted = false; clearInterval(iv); };
  }, [fetchStatus, fetchIntentDistribution, fetchUnlabeled, fetchModelVersions]);

  // Normalized accuracy display (handles 0..1 and 0..100 formats)
  const accuracyPercent = useMemo(() => {
    const accuracyValue = modelMeta?.accuracy;
    return typeof accuracyValue === 'number' ? (accuracyValue <= 1 ? accuracyValue * 100 : accuracyValue) : (accuracyValue ? Number(accuracyValue) : null);
  }, [modelMeta?.accuracy]);
  const accuracyText = useMemo(() =>
    accuracyPercent != null && !Number.isNaN(accuracyPercent) ? `${Number(accuracyPercent).toFixed(2)}%` : '-',
    [accuracyPercent]
  );

  const handleRetrain = useCallback(async (force = false) => {
    try {
      setRetraining(true);
      const res = await api.post('chatbot/retrain', { force }, { skipGlobalErrorHandling: true });
      if (res.data && res.data.new_version) {
        toast.success(`Retrained → ${res.data.new_version}`);
        fetchStatus();
        fetchIntentDistribution();
        fetchModelVersions();
        fetchTrainingExamples(trainingPage, trainingLimit, trainingQuery);
      } else {
        toast.success(res.data.message || 'Retrain triggered');
      }
    } catch {
      toast.error('Retrain failed');
    } finally {
      setRetraining(false);
    }
  }, [fetchStatus, fetchIntentDistribution, fetchModelVersions, fetchTrainingExamples, trainingPage, trainingLimit, trainingQuery]);

  const handleLabel = useCallback(async (logId, intent) => {
    try {
      await api.post('chatbot/label', { log_id: logId, correct_intent: intent }, { skipGlobalErrorHandling: true });
      setMessages(prev => prev.filter(m => m.id !== logId));
      setLabeledToday(n => n + 1);
      toast.success('Label saved');
    } catch {
      toast.error('Failed to save label');
    }
  }, []);

  const handleSkip = useCallback((logId) => {
    setMessages(prev => prev.filter(m => m.id !== logId));
  }, []);

  const addExample = useCallback(async (text, intent) => {
    try {
      await api.post('chatbot/training-examples', { text, intent, source: 'manual' }, { skipGlobalErrorHandling: true });
      toast.success('Example added');
      fetchIntentDistribution();
      fetchTrainingExamples(trainingPage, trainingLimit, trainingQuery);
    } catch { toast.error('Failed to add example'); }
  }, [fetchIntentDistribution, fetchTrainingExamples, trainingPage, trainingLimit, trainingQuery]);

  const bulkImport = useCallback(async (lines) => {
    const payload = lines.map(l => {
      const parts = l.split('|').map(p => p.trim());
      return { text: parts[0] || '', intent: parts[1] || 'other', source: 'manual' };
    }).filter(p => p.text && p.intent);
    if (!payload.length) return toast.error('No valid lines');
    try {
      await api.post('chatbot/training-examples', payload, { skipGlobalErrorHandling: true });
      toast.success('Imported examples');
      fetchIntentDistribution();
      fetchTrainingExamples(trainingPage, trainingLimit, trainingQuery);
    } catch { toast.error('Import failed'); }
  }, [fetchIntentDistribution, fetchTrainingExamples, trainingPage, trainingLimit, trainingQuery]);

  return (
    <PageContainer>
      <div className="page-actions">
        <div className="tabs">
          <button className={`btn ${tab==='dashboard'?'btn-primary':''}`} onClick={() => setTab('dashboard')}>Dashboard</button>
          <button className={`btn ${tab==='label'?'btn-primary':''}`} onClick={() => setTab('label')}>Label Messages</button>
          <button className={`btn ${tab==='training'?'btn-primary':''}`} onClick={() => setTab('training')}>Training Data</button>
          <button className={`btn ${tab==='history'?'btn-primary':''}`} onClick={() => setTab('history')}>Model History</button>
        </div>
      </div>

      <div style={{ flex: 1, padding: 16 }}>
        {loading ? <SkeletonLoader type="cards" count={3} /> : (
          tab === 'dashboard' ? (
            <div>
              <div className="card">
                <h3>
                  Model Status
                  {isOffline && (
                    <span className="badge badge-error ml-8" style={{ backgroundColor: 'var(--destructive)', color: 'var(--card)', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
                      Chatbot Offline
                    </span>
                  )}
                </h3>
                {isOffline ? (
                  <div style={{ color: 'var(--destructive)', fontWeight: 'bold', marginTop: 8 }}>
                    Chatbot Offline
                  </div>
                ) : (
                  <>
                    <div className="row gap-sm">
                      <div>Version: <strong>{modelMeta?.version || '-'}</strong></div>
                      <div>Samples: <strong>{modelMeta?.sample_count || 0}</strong></div>
                      <div>Accuracy: <strong>{accuracyText}</strong></div>
                      <div>Last trained: <strong>{modelMeta?.trained_at || '-'}</strong></div>
                      <div>Pending labels: <strong>{unlabeledCount}</strong></div>
                      <div>Ready to retrain: <strong>{pendingCount}</strong></div>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <button className="btn btn-primary" onClick={() => handleRetrain(false)} disabled={retraining}>{retraining ? 'Retraining…' : 'Retrain Now'}</button>
                      <button className="btn btn-ghost ml-8" onClick={() => handleRetrain(true)} disabled={retraining}>Force Retrain</button>
                    </div>
                  </>
                )}
              </div>

              <div className="card" style={{ height: 260, marginTop: 12 }}>
                <h4>Intent distribution</h4>
                {intentDist.length > 0 && chartReady ? (
                  <div style={{ minWidth: 200, minHeight: 180 }}>
                    <ResponsiveContainer width="100%" height={180} minWidth={0}>
                      <BarChart data={intentDist}>
                        <XAxis dataKey="intent" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill='var(--primary)' />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div style={{ height: 180, display: 'grid', placeItems: 'center' }}><EmptyState icon={Brain} title="No training data yet" /></div>
                )}
              </div>
            </div>
          ) : tab === 'label' ? (
            <div>
              <h3>Label Messages</h3>
              <div style={{ marginTop: 8 }}>{labeledToday} messages labeled today</div>
              <div style={{ marginTop: 12 }}>
                {messages.length === 0 ? <div>✅ നല്ലത്! All messages reviewed.</div> : messages.map(msg => (
                  <div key={msg.id} className="card" style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 16, marginBottom: 8 }}>{msg.message}</div>
                    <div className="row gap-sm" style={{ marginBottom: 8 }}>
                      <div className="badge">Predicted: {msg.predicted_intent}</div>
                      <div className="badge">{Math.round((msg.confidence||0))}%</div>
                      <div className="muted">{msg.branch} • {msg.created_at}</div>
                    </div>
                    <div className="row gap-sm">
                      {INTENTS.map(i => (
                        <button key={i} className="btn btn-ghost btn-sm" onClick={() => handleLabel(msg.id, i)}>{i}</button>
                      ))}
                      <button className="btn btn-ghost btn-sm text-error" onClick={() => handleSkip(msg.id)}>Skip</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : tab === 'training' ? (
            <div>
              <h3>Training Examples</h3>
              <div style={{ marginTop: 8 }}>
                <div className="row gap-sm" style={{ marginBottom: 8 }}>
                  <input placeholder="Search examples" value={trainingQuery} onChange={e => setTrainingQuery(e.target.value)} />
                  <button className="btn btn-ghost" onClick={() => fetchTrainingExamples(1, trainingLimit, trainingQuery)}>Search</button>
                </div>
                <table className="table">
                  <thead><tr><th>Text</th><th>Intent</th><th>Source</th><th>Date</th></tr></thead>
                  <tbody>
                    {trainingExamples.map(r => (
                      <tr key={r.id}><td>{r.text}</td><td>{r.intent}</td><td>{r.source}</td><td>{r.added_at}</td></tr>
                    ))}
                  </tbody>
                </table>
                <div className="row gap-sm" style={{ marginTop: 8, alignItems: 'center' }}>
                  <div>Page {trainingPage} / {Math.max(1, Math.ceil(trainingTotal / trainingLimit))}</div>
                  <button className="btn btn-ghost" onClick={() => fetchTrainingExamples(Math.max(1, trainingPage - 1), trainingLimit, trainingQuery)}>Prev</button>
                  <button className="btn btn-ghost" onClick={() => fetchTrainingExamples(trainingPage + 1, trainingLimit, trainingQuery)}>Next</button>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <h4>Add example</h4>
                <ManualAdd onAdd={addExample} />
                <h4 style={{ marginTop: 12 }}>Bulk import (text | intent per line)</h4>
                <BulkImport onImport={bulkImport} />
              </div>
            </div>
          ) : (
            <div>
              <h3>Model History</h3>
              {modelVersions.map(v => (
                <div key={v.id} className="card" style={{ marginBottom: 8 }}>
                  <div className="row gap-sm"><strong>{v.version}</strong><span>{(v.accuracy*100 || v.accuracy).toFixed ? `${(v.accuracy*100||v.accuracy).toFixed(2)}%` : v.accuracy}</span><span>{v.training_samples} samples</span><span>{v.trained_at}</span>{v.is_active ? <span className="badge">Active</span> : null}</div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Floating chat widget for admin */}
      <ChatWidget />
    </PageContainer>
  );
};

const ManualAdd = ({ onAdd }) => {
  const [text, setText] = useState('');
  const [intent, setIntent] = useState('other');
  return (
    <div className="row gap-sm">
      <input value={text} onChange={e => setText(e.target.value)} placeholder="ഉദാഹരണം (Malayalam supported)" />
      <select value={intent} onChange={e => setIntent(e.target.value)}>
        {INTENTS.map(i => <option key={i} value={i}>{i}</option>)}
      </select>
      <button className="btn btn-primary" onClick={() => { if (text) { onAdd(text, intent); setText(''); } }}>Add Example</button>
    </div>
  );
};

const BulkImport = ({ onImport }) => {
  const [text, setText] = useState('');
  return (
    <div>
      <textarea rows={6} value={text} onChange={e => setText(e.target.value)} style={{ width: '100%' }} />
      <div className="row gap-sm" style={{ marginTop: 8 }}>
        <button className="btn btn-primary" onClick={() => { onImport(text.split('\n')); setText(''); }}>Import</button>
      </div>
    </div>
  );
};

export default React.memo(ChatbotTraining);
