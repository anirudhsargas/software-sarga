import { useSEO } from '../hooks/useSEO';
import { useState, useEffect, useCallback } from 'react';
import { Camera, Plus, X, Edit2, Trash2, Loader2, RefreshCw, Eye, EyeOff, Wifi, WifiOff, User, Upload, Image, Video, MonitorPlay, Network, KeyRound, UserCheck, ChevronRight, ExternalLink } from 'lucide-react';
import api from '../services/api';
import SecureImage from '../components/SecureImage';
import toast from 'react-hot-toast';

import BranchSelect from '../components/ui/BranchSelect';
import PageContainer from '../components/ui/PageContainer';
const BRANCHES = [
  { value: 'perambra', label: 'Perambra' },
  { value: 'meppayur_main', label: 'Meppayur Main' },
  { value: 'meppayur_room', label: 'Meppayur Room' },
];

const BRANCH_COLORS = {
  perambra: { bg: 'var(--accent)', color: 'var(--muted-foreground)', dot: 'var(--accent)' },
  meppayur_main: { bg: 'var(--success)', color: 'var(--success)', dot: 'var(--success)' },
  meppayur_room: { bg: 'var(--warning)', color: 'var(--warning)', dot: 'var(--warning)' },
};

const BranchPill = ({ branch }) => {
  const label = BRANCHES.find(b => b.value === branch)?.label || branch;
  const c = BRANCH_COLORS[branch] || { bg: 'var(--muted-foreground)', color: 'var(--muted)', dot: 'var(--muted)' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, display: 'inline-block' }} />
      {label}
    </span>
  );
};

const CCTVManagement = () => {
    useSEO('C C T V Management');

  const [tab, setTab] = useState('cameras');
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);

  // Camera form
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [editingCamera, setEditingCamera] = useState(null);
  const [cameraForm, setCameraForm] = useState({ name: '', branch: 'perambra', ip_address: '', port: 554, username: 'admin', password: '', rtsp_path: '/Streaming/Channels/101' });
  const [cameraSaving, setCameraSaving] = useState(false);

  // Live view
  const [liveCamera, setLiveCamera] = useState(null);
  const [snapshotUrl, setSnapshotUrl] = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState(null);
  const [showPassword, setShowPassword] = useState({});

  // Face data
  const [faceStats, setFaceStats] = useState([]);
  const [faceData, setFaceData] = useState([]);
  const [faceLoading, setFaceLoading] = useState(false);
  const [showFaceModal, setShowFaceModal] = useState(false);
  const [faceStaffId, setFaceStaffId] = useState('');
  const [faceLabel, setFaceLabel] = useState('');
  const [faceFile, setFaceFile] = useState(null);
  const [facePreview, setFacePreview] = useState('');
  const [faceSaving, setFaceSaving] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [selectedStaffFace, setSelectedStaffFace] = useState(null);

  // Attendance quick-mark
  const [markingAttendance, setMarkingAttendance] = useState(null);
  const [attendanceBranch, setAttendanceBranch] = useState('');
  const [attendanceType, setAttendanceType] = useState('entry');

  // ─── Fetch cameras ──────────────────────────────────
  const fetchCameras = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('cctv/cameras');
      setCameras(data);
    } catch {
      toast.error('Failed to load cameras');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCameras(); }, [fetchCameras]);

  // ─── Fetch staff list ──────────────────────────────────
  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const { data } = await api.get('staff?all=true&limit=200');
        setStaffList(data.data || data || []);
      } catch { /* silent */ }
    };
    fetchStaff();
  }, []);

  // ─── Camera CRUD ──────────────────────────────────────
  const openAddCamera = () => {
    setEditingCamera(null);
    setCameraForm({ name: '', branch: 'perambra', ip_address: '', port: 554, username: 'admin', password: '', rtsp_path: '/Streaming/Channels/101' });
    setShowCameraModal(true);
  };

  const openEditCamera = async (cam) => {
    try {
      const { data } = await api.get(`cctv/cameras/${cam.id}`);
      setEditingCamera(data);
      setCameraForm({
        name: data.name, branch: data.branch, ip_address: data.ip_address,
        port: data.port, username: data.username, password: data.password,
        rtsp_path: data.rtsp_path
      });
      setShowCameraModal(true);
    } catch {
      toast.error('Failed to load camera details');
    }
  };

  const handleCameraSave = async (e) => {
    e.preventDefault();
    if (!cameraForm.name || !cameraForm.ip_address || !cameraForm.password) {
      toast.error('Name, IP address, and password are required');
      return;
    }
    setCameraSaving(true);
    try {
      if (editingCamera) {
        await api.put(`cctv/cameras/${editingCamera.id}`, cameraForm);
        toast.success('Camera updated');
      } else {
        await api.post('cctv/cameras', cameraForm);
        toast.success('Camera added');
      }
      setShowCameraModal(false);
      fetchCameras();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save camera');
    } finally {
      setCameraSaving(false);
    }
  };

  const handleDeleteCamera = async (cam) => {
    if (!window.confirm(`Delete camera "${cam.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`cctv/cameras/${cam.id}`);
      toast.success('Camera deleted');
      fetchCameras();
      if (liveCamera?.id === cam.id) { setLiveCamera(null); setSnapshotUrl(null); }
    } catch {
      toast.error('Failed to delete camera');
    }
  };

  const toggleCameraActive = async (cam) => {
    try {
      await api.put(`cctv/cameras/${cam.id}`, { is_active: !cam.is_active });
      fetchCameras();
      toast.success(cam.is_active ? 'Camera disabled' : 'Camera enabled');
    } catch (err) {
      toast.error('Failed to update camera');
    }
  };

  // ─── Snapshot / Live view ──────────────────────────────
  const fetchSnapshot = async (cam) => {
    setLiveCamera(cam);
    setSnapshotLoading(true);
    setSnapshotError(null);
    setSnapshotUrl(null);
    try {
      const res = await api.get(`cctv/cameras/${cam.id}/snapshot`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      setSnapshotUrl(url);
    } catch (err) {
      setSnapshotError(err.response?.data?.message || 'Cannot reach camera');
    } finally {
      setSnapshotLoading(false);
    }
  };

  const openCameraWebUI = (cam) => {
    window.open(`http://${cam.ip_address}`, '_blank', 'noopener');
  };

  // ─── Quick Mark Attendance from Live View ──────────────
  const handleMarkAttendance = async (staffId) => {
    if (!staffId || !attendanceBranch || !attendanceType) {
      toast.error('Select staff, branch and event type');
      return;
    }
    setMarkingAttendance(staffId);
    try {
      await api.post('cctv/attendance', {
        staff_id: parseInt(staffId, 10),
        branch: attendanceBranch,
        event_type: attendanceType,
        source: 'manual',
        timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
      });
      toast.success('Attendance marked');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to mark attendance');
    } finally {
      setMarkingAttendance(null);
    }
  };

  // ─── Face Data ─────────────────────────────────────────
  const fetchFaceStats = useCallback(async () => {
    setFaceLoading(true);
    try {
      const { data } = await api.get('cctv/face-data/stats');
      setFaceStats(data);
    } catch {
      toast.error('Failed to load face data');
    } finally {
      setFaceLoading(false);
    }
  }, []);

  const fetchFaceDataForStaff = async (staffId) => {
    setSelectedStaffFace(staffId);
    try {
      const { data } = await api.get(`cctv/face-data?staff_id=${staffId}`);
      setFaceData(data);
    } catch {
      toast.error('Failed to load face images');
    }
  };

  useEffect(() => {
    if (tab === 'faces') fetchFaceStats();
  }, [tab, fetchFaceStats]);

  const openFaceUpload = (staffId) => {
    setFaceStaffId(staffId || '');
    setFaceLabel('');
    setFaceFile(null);
    setFacePreview('');
    setShowFaceModal(true);
  };

  const handleFaceFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFaceFile(file);
      setFacePreview(URL.createObjectURL(file));
    }
  };

  const handleFaceUpload = async (e) => {
    e.preventDefault();
    if (!faceStaffId || !faceFile) {
      toast.error('Select a staff member and upload an image');
      return;
    }
    setFaceSaving(true);
    try {
      const formData = new FormData();
      formData.append('staff_id', faceStaffId);
      formData.append('face_image', faceFile);
      if (faceLabel) formData.append('label', faceLabel);
      await api.post('cctv/face-data', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Face image uploaded');
      setShowFaceModal(false);
      fetchFaceStats();
      if (selectedStaffFace == faceStaffId) fetchFaceDataForStaff(faceStaffId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setFaceSaving(false);
    }
  };

  const handleDeleteFaceData = async (fdId) => {
    if (!window.confirm('Remove this face image?')) return;
    try {
      await api.delete(`cctv/face-data/${fdId}`);
      toast.success('Face image removed');
      if (selectedStaffFace) fetchFaceDataForStaff(selectedStaffFace);
      fetchFaceStats();
    } catch {
      toast.error('Failed to remove');
    }
  };

  const togglePassword = (camId) => setShowPassword(prev => ({ ...prev, [camId]: !prev[camId] }));

  return (
    <PageContainer>
      {/* ── Page Header ── */}
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, var(--accent), rgba(var(--accent-rgb), 0.5))', boxShadow: '0 2px 8px rgba(var(--accent-rgb), 0.35)' }}>
            <Video size={18} color="var(--on-accent)" />
          </span>
          CCTV Management
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={tab === 'cameras' ? fetchCameras : fetchFaceStats} title="Refresh" style={{ padding: '8px 10px', minWidth: 'auto' }}>
            <RefreshCw size={15} className={loading || faceLoading ? 'animate-spin' : ''} />
          </button>
          {tab === 'cameras' && (
            <button className="btn btn-primary" onClick={openAddCamera} style={{ gap: 6 }}>
              <Plus size={15} /> Add Camera
            </button>
          )}
          {tab === 'faces' && (
            <button className="btn btn-primary" onClick={() => openFaceUpload('')} style={{ gap: 6 }}>
              <Upload size={15} /> Add Face
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', borderRadius: 12, padding: 4, marginBottom: 24, width: 'fit-content' }}>
        {[
          { key: 'cameras', label: 'Cameras', icon: Camera },
          { key: 'live',    label: 'Live View', icon: MonitorPlay },
          { key: 'faces',   label: 'Face Data', icon: UserCheck },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 9, fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
              background: tab === t.key ? 'var(--primary)' : 'transparent',
              color: tab === t.key ? 'var(--on-accent)' : 'var(--muted)',
              border: 'none', cursor: 'pointer', transition: 'all .15s',
            }}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* CAMERAS TAB                                          */}
      {/* ══════════════════════════════════════════════════════ */}
      {tab === 'cameras' && (
        loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted)' }}>
            <Loader2 size={24} className="animate-spin" style={{ display: 'inline-block', marginRight: 8 }} /> Loading cameras…
          </div>
        ) : cameras.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--muted)' }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Camera size={28} style={{ opacity: 0.35 }} />
            </div>
            <p style={{ marginBottom: 16, fontWeight: 500 }}>No cameras configured yet</p>
            <button className="btn btn-primary" onClick={openAddCamera}><Plus size={15} /> Add First Camera</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {cameras.map(cam => {
              const bc = BRANCH_COLORS[cam.branch] || {};
              return (
                <div key={cam.id} className="card" style={{
                  padding: 0, overflow: 'hidden', opacity: cam.is_active ? 1 : 0.55,
                  border: cam.is_active ? '1px solid var(--border)' : '1px dashed var(--border)',
                  transition: 'box-shadow .2s',
                }}>
                  {/* Card Header */}
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: bc.bg || 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Camera size={16} style={{ color: bc.color || 'var(--muted)' }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.2 }}>{cam.name}</div>
                        <div style={{ marginTop: 3 }}><BranchPill branch={cam.branch} /></div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button onClick={() => openEditCamera(cam)} title="Edit" style={{ padding: 7, background: 'none', border: 'none', cursor: 'pointer', borderRadius: 7, color: 'var(--muted)' }}>
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDeleteCamera(cam)} title="Delete" style={{ padding: 7, background: 'none', border: 'none', cursor: 'pointer', borderRadius: 7, color: 'var(--error)' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div style={{ padding: '14px 16px', display: 'grid', gap: 8 }}>
                    <InfoRow icon={<Network size={13} />} label="IP Address" value={<code style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 5 }}>{cam.ip_address}:{cam.port}</code>} />
                    <InfoRow icon={<User size={13} />} label="Username" value={cam.username} />
                    <InfoRow icon={cam.is_active ? <Wifi size={13} style={{ color: 'var(--success)' }} /> : <WifiOff size={13} style={{ color: 'var(--error)' }} />} label="Status" value={
                      <span style={{ fontSize: 12, fontWeight: 600, color: cam.is_active ? 'var(--success)' : 'var(--muted)' }}>
                        {cam.is_active ? 'Active' : 'Disabled'}
                      </span>
                    } />
                  </div>

                  {/* Card Actions */}
                  <div style={{ padding: '10px 16px 14px', display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { setTab('live'); fetchSnapshot(cam); }}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--text)', transition: 'background .15s' }}
                    >
                      <Eye size={13} /> Live View
                    </button>
                    <button
                      onClick={() => openCameraWebUI(cam)}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--text)', transition: 'background .15s' }}
                    >
                      <ExternalLink size={13} /> Web UI
                    </button>
                    <button
                      onClick={() => toggleCameraActive(cam)}
                      title={cam.is_active ? 'Disable' : 'Enable'}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: cam.is_active ? 'var(--error)' : 'var(--success)', transition: 'background .15s' }}
                    >
                      {cam.is_active ? <WifiOff size={13} /> : <Wifi size={13} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* LIVE VIEW TAB                                        */}
      {/* ══════════════════════════════════════════════════════ */}
      {tab === 'live' && (
        <div>
          {/* Camera pill selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {cameras.filter(c => c.is_active).map(cam => (
              <button
                key={cam.id}
                onClick={() => fetchSnapshot(cam)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 500,
                  background: liveCamera?.id === cam.id ? 'var(--primary)' : 'var(--surface-2)',
                  color: liveCamera?.id === cam.id ? 'var(--on-accent)' : 'var(--text)',
                  border: liveCamera?.id === cam.id ? 'none' : '1px solid var(--border)',
                  cursor: 'pointer', transition: 'all .15s',
                }}
              >
                <Camera size={13} /> {cam.name}
                <BranchPill branch={cam.branch} />
              </button>
            ))}
            {cameras.filter(c => c.is_active).length === 0 && (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>No active cameras. Add and enable cameras first.</p>
            )}
          </div>

          {liveCamera ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>
              {/* Snapshot */}
              <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
                    <Camera size={15} style={{ color: 'var(--muted)' }} /> {liveCamera.name}
                    <BranchPill branch={liveCamera.branch} />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => fetchSnapshot(liveCamera)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text)' }}>
                      <RefreshCw size={13} className={snapshotLoading ? 'animate-spin' : ''} /> Refresh
                    </button>
                    <button onClick={() => openCameraWebUI(liveCamera)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text)' }}>
                      <ExternalLink size={13} /> Full UI
                    </button>
                  </div>
                </div>
                <div style={{ background: 'var(--bg-2)', minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  {snapshotLoading ? (
                    <div style={{ color: 'var(--on-accent)', textAlign: 'center', padding: 40 }}>
                      <Loader2 size={36} className="animate-spin" style={{ display: 'block', margin: '0 auto 12px', opacity: 0.7 }} />
                      <span style={{ fontSize: 13, opacity: 0.6 }}>Connecting to camera…</span>
                    </div>
                  ) : snapshotError ? (
                    <div style={{ color: 'var(--destructive)', textAlign: 'center', padding: 40 }}>
                      <WifiOff size={36} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.6 }} />
                      <p style={{ fontSize: 13, marginBottom: 12 }}>{snapshotError}</p>
                      <button onClick={() => fetchSnapshot(liveCamera)} style={{ padding: '7px 16px', borderRadius: 8, background: 'var(--card)', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--on-accent)', cursor: 'pointer', fontSize: 12 }}>
                        Retry
                      </button>
                    </div>
                  ) : snapshotUrl ? (
                    <img loading="lazy" src={snapshotUrl} alt="CCTV Snapshot" style={{ width: '100%', display: 'block' }} />
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Click Refresh to load snapshot</div>
                  )}
                </div>
                <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
                  {liveCamera.ip_address} • Click "Full UI" to open camera web interface for live stream
                </div>
              </div>

              {/* Quick attendance panel */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <UserCheck size={15} style={{ color: 'var(--muted)' }} /> Mark Attendance
                </div>
                <div style={{ padding: 14, display: 'grid', gap: 10 }}>
                  <div>
                    <label className="label" style={{ fontSize: 11 }}>Branch</label>
                    <BranchSelect className="input-field" value={attendanceBranch || liveCamera.branch} onChange={e => setAttendanceBranch(e.target.value)}>
                      {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </BranchSelect>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {['entry', 'exit'].map(t => (
                      <button
                        key={t}
                        onClick={() => setAttendanceType(t)}
                        style={{
                          padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                          background: attendanceType === t ? (t === 'entry' ? 'var(--success)' : 'var(--warning)') : 'var(--surface-2)',
                          color: attendanceType === t ? 'var(--on-accent)' : 'var(--muted)',
                        }}
                      >
                        {t === 'entry' ? '→ Entry' : '← Exit'}
                      </button>
                    ))}
                  </div>
                  <div style={{ maxHeight: 310, overflowY: 'auto', display: 'grid', gap: 2 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>Staff</div>
                    {staffList.map(s => (
                      <button
                        key={s.id}
                        disabled={markingAttendance === s.id}
                        onClick={() => handleMarkAttendance(s.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
                          background: markingAttendance === s.id ? 'var(--surface-2)' : 'transparent',
                          border: '1px solid transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text)', textAlign: 'left', transition: 'background .12s',
                        }}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                          {s.image_url ? <SecureImage src={s.image_url} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={13} />}
                        </div>
                        <span style={{ flex: 1 }}>{s.name}</span>
                        {markingAttendance === s.id
                          ? <Loader2 size={13} className="animate-spin" style={{ color: 'var(--muted)' }} />
                          : <ChevronRight size={12} style={{ color: 'var(--muted)', opacity: 0.5 }} />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : cameras.filter(c => c.is_active).length > 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
              <MonitorPlay size={40} style={{ opacity: 0.2, margin: '0 auto 12px', display: 'block' }} />
              <p>Select a camera above to view snapshot</p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* FACE DATA TAB                                        */}
      {/* ══════════════════════════════════════════════════════ */}
      {tab === 'faces' && (
        faceLoading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted)' }}>
            <Loader2 size={24} className="animate-spin" style={{ display: 'inline-block', marginRight: 8 }} /> Loading…
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: selectedStaffFace ? '1fr 1fr' : '1fr', gap: 16 }}>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                <UserCheck size={15} style={{ color: 'var(--muted)' }} /> Staff Face Data
              </div>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr><th>Staff</th><th>Face Images</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {faceStats.map(s => (
                      <tr key={s.staff_id} style={selectedStaffFace === s.staff_id ? { background: 'var(--surface-2)' } : undefined}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                              {s.staff_image ? <SecureImage src={s.staff_image} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={14} />}
                            </div>
                            <span style={{ fontWeight: 500, fontSize: 13 }}>{s.name}</span>
                          </div>
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                            background: s.face_count > 0 ? 'var(--success)' : 'var(--destructive)',
                            color: s.face_count > 0 ? 'var(--success)' : 'var(--destructive)',
                          }}>
                            <Image size={11} /> {s.face_count} {s.face_count === 1 ? 'image' : 'images'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => fetchFaceDataForStaff(s.staff_id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--text)' }}>
                              <Eye size={12} /> View
                            </button>
                            <button onClick={() => openFaceUpload(s.staff_id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--text)' }}>
                              <Upload size={12} /> Add
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {faceStats.length === 0 && (
                      <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2.5rem' }}>No staff found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedStaffFace && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    {faceStats.find(s => s.staff_id === selectedStaffFace)?.name || 'Staff'} — Photos
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openFaceUpload(selectedStaffFace)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--text)' }}>
                      <Upload size={12} /> Add
                    </button>
                    <button onClick={() => { setSelectedStaffFace(null); setFaceData([]); }} style={{ padding: '5px 8px', borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)' }}>
                      <X size={15} />
                    </button>
                  </div>
                </div>
                <div style={{ padding: 16 }}>
                  {faceData.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>
                      <Image size={32} style={{ opacity: 0.2, display: 'block', margin: '0 auto 10px' }} />
                      <p style={{ fontSize: 13 }}>No face images yet</p>
                      <button onClick={() => openFaceUpload(selectedStaffFace)} className="btn btn-primary" style={{ marginTop: 10, fontSize: 12 }}>
                        <Upload size={13} /> Upload First Image
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
                      {faceData.map(fd => (
                        <div key={fd.id} style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative', background: 'var(--surface-2)' }}>
                          <SecureImage src={fd.image_url} alt={fd.label || 'Face'} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                          <div style={{ padding: '6px 8px' }}>
                            <div style={{ fontWeight: 500, fontSize: 11, color: 'var(--text)' }}>{fd.label || '—'}</div>
                            <div style={{ color: 'var(--muted)', fontSize: 10 }}>{new Date(fd.created_at).toLocaleDateString()}</div>
                          </div>
                          <button onClick={() => handleDeleteFaceData(fd.id)} style={{ position: 'absolute', top: 5, right: 5, background: 'var(--shadow-sm)', backdropFilter: 'blur(4px)', border: 'none', borderRadius: 6, padding: '4px 5px', cursor: 'pointer', color: 'var(--on-accent)', lineHeight: 0 }} title="Remove">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* ADD / EDIT CAMERA MODAL                              */}
      {/* ══════════════════════════════════════════════════════ */}
      {showCameraModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 500, padding: 0, overflow: 'hidden' }}>
            {/* Modal Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, var(--accent), rgba(var(--accent-rgb), 0.5))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Camera size={17} color="var(--on-accent)" />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{editingCamera ? 'Edit Camera' : 'Add Camera'}</h2>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Configure IP camera credentials</p>
                </div>
              </div>
              <button onClick={() => setShowCameraModal(false)} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, color: 'var(--muted)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCameraSave}>
              <div style={{ padding: '20px 24px', display: 'grid', gap: 18 }}>
                {/* Name + Branch */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="label">Camera Name <span style={{ color: 'var(--error)' }}>*</span></label>
                    <input className="input-field" placeholder="e.g. Meppayur Other Room" value={cameraForm.name} onChange={e => setCameraForm(f => ({ ...f, name: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="label">Branch <span style={{ color: 'var(--error)' }}>*</span></label>
                    <BranchSelect className="input-field" value={cameraForm.branch} onChange={e => setCameraForm(f => ({ ...f, branch: e.target.value }))} required>
                      {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </BranchSelect>
                  </div>
                </div>

                {/* Divider with section label */}
                <SectionDivider icon={<Network size={13} />} label="Network" />

                {/* IP + Port */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 12 }}>
                  <div>
                    <label className="label">IP Address <span style={{ color: 'var(--error)' }}>*</span></label>
                    <input className="input-field" placeholder="192.168.1.125" value={cameraForm.ip_address} onChange={e => setCameraForm(f => ({ ...f, ip_address: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="label">RTSP Port</label>
                    <input className="input-field" type="number" value={cameraForm.port} onChange={e => setCameraForm(f => ({ ...f, port: parseInt(e.target.value) || 554 }))} />
                  </div>
                </div>

                {/* RTSP Path */}
                <div>
                  <label className="label">RTSP Stream Path</label>
                  <input className="input-field" placeholder="/Streaming/Channels/101" value={cameraForm.rtsp_path} onChange={e => setCameraForm(f => ({ ...f, rtsp_path: e.target.value }))} />
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted)' }}>Hikvision default: <code style={{ background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 4 }}>/Streaming/Channels/101</code></p>
                </div>

                <SectionDivider icon={<KeyRound size={13} />} label="Credentials" />

                {/* Username + Password */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="label">Username</label>
                    <input className="input-field" placeholder="admin" value={cameraForm.username} onChange={e => setCameraForm(f => ({ ...f, username: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Password <span style={{ color: 'var(--error)' }}>*</span></label>
                    <div className="input-group--flex">
                      <input
                        className="input-field"
                        type={showPassword['modal'] ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={cameraForm.password}
                        onChange={e => setCameraForm(f => ({ ...f, password: e.target.value }))}
                        required
                      />
                      <button type="button" className="input-action" onClick={() => togglePassword('modal')}>
                        {showPassword['modal'] ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{ padding: '14px 24px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowCameraModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={cameraSaving} style={{ minWidth: 120 }}>
                  {cameraSaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : editingCamera ? 'Update Camera' : 'Add Camera'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* FACE UPLOAD MODAL                                    */}
      {/* ══════════════════════════════════════════════════════ */}
      {showFaceModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 440, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#10b981,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserCheck size={17} color="var(--on-accent)" />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Upload Face Image</h2>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Add a photo for face recognition</p>
                </div>
              </div>
              <button onClick={() => setShowFaceModal(false)} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, color: 'var(--muted)' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleFaceUpload}>
              <div style={{ padding: '20px 24px', display: 'grid', gap: 16 }}>
                <div>
                  <label className="label">Staff Member <span style={{ color: 'var(--error)' }}>*</span></label>
                  <select className="input-field" value={faceStaffId} onChange={e => setFaceStaffId(e.target.value)} required>
                    <option value="">Select staff…</option>
                    {staffList.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Label <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
                  <input className="input-field" placeholder="e.g. Front angle, Side view" value={faceLabel} onChange={e => setFaceLabel(e.target.value)} />
                </div>

                {/* Drop zone */}
                <div>
                  <label className="label">Photo <span style={{ color: 'var(--error)' }}>*</span></label>
                  <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '24px 16px', borderRadius: 10, border: '2px dashed var(--border)', cursor: 'pointer', transition: 'border-color .15s', background: facePreview ? 'transparent' : 'var(--surface-2)' }}>
                    {facePreview ? (
                      <img loading="lazy" src={facePreview} alt="Preview" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 10, border: '2px solid var(--border)' }} />
                    ) : (
                      <>
                        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Upload size={18} style={{ color: 'var(--muted)' }} />
                        </div>
                        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Click to upload a photo</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.6 }}>JPG, PNG or WEBP, max 5MB</span>
                      </>
                    )}
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFaceFileChange} style={{ display: 'none' }} required />
                  </label>
                  {facePreview && (
                    <button type="button" onClick={() => { setFaceFile(null); setFacePreview(''); }} style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <X size={12} /> Remove photo
                    </button>
                  )}
                </div>
              </div>

              <div style={{ padding: '14px 24px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowFaceModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={faceSaving} style={{ minWidth: 100 }}>
                  {faceSaving ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

// ── Small helper components ──
const InfoRow = ({ icon, label, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)' }}>{icon}{label}</span>
    <span style={{ fontSize: 13 }}>{value}</span>
  </div>
);

const SectionDivider = ({ icon, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{icon}{label}</span>
    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
  </div>
);

export default CCTVManagement;
