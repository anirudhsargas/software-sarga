import { useSEO } from '../hooks/useSEO';
import { useState, useEffect, useCallback } from 'react';
import { Camera, Plus, X, Edit2, Trash2, Loader2, RefreshCw, Eye, EyeOff, Wifi, WifiOff, User, Upload, Image, MonitorPlay, Network, KeyRound, UserCheck, ChevronRight, ExternalLink, Video } from 'lucide-react';
import api from '../services/api';
import SecureImage from '../components/SecureImage';
import toast from 'react-hot-toast';
import BranchSelect from '../components/ui/BranchSelect';
import PageContainer from '../components/ui/PageContainer';
import './CCTVManagement.css';

const BRANCHES = [
  { value: 'perambra', label: 'Perambra' },
  { value: 'meppayur_main', label: 'Meppayur Main' },
  { value: 'meppayur_room', label: 'Meppayur Room' },
];

const BRANCH_COLORS = {
  perambra: { bg: 'var(--accent)', color: 'var(--muted-foreground)', dot: 'var(--accent)' },
  meppayur_main: { bg: 'var(--success-bg)', color: 'var(--success)', dot: 'var(--success)' },
  meppayur_room: { bg: 'var(--warning-bg)', color: 'var(--warning)', dot: 'var(--warning)' },
};

const BranchPill = ({ branch }) => {
  const label = BRANCHES.find(b => b.value === branch)?.label || branch;
  const c = BRANCH_COLORS[branch] || { bg: 'var(--surface-2)', color: 'var(--muted)', dot: 'var(--muted)' };
  return (
    <span className="cctv-branch-pill" style={{ background: c.bg, color: c.color }}>
      <span className="cctv-branch-dot" style={{ background: c.dot }} />
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
    } catch {
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
      <div className="cctv-header">
        <h1 className="cctv-header-title">
          <span className="cctv-header-icon">
            <Video size={18} />
          </span>
          CCTV Management
        </h1>
        <div className="cctv-header-actions">
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
      <div className="cctv-tabs">
        {[
          { key: 'cameras', label: 'Cameras', icon: Camera },
          { key: 'live',    label: 'Live View', icon: MonitorPlay },
          { key: 'faces',   label: 'Face Data', icon: UserCheck },
        ].map(t => (
          <button
            key={t.key}
            className={`cctv-tab${tab === t.key ? ' cctv-tab--active' : ''}`}
            onClick={() => setTab(t.key)}
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
          <div className="cctv-loading">
            <Loader2 size={24} className="animate-spin" style={{ display: 'inline-block', marginRight: 8 }} /> Loading cameras…
          </div>
        ) : cameras.length === 0 ? (
          <div className="card cctv-empty">
            <div className="cctv-empty-icon">
              <Camera size={28} />
            </div>
            <p className="cctv-empty-text">No cameras configured yet</p>
            <button className="btn btn-primary" onClick={openAddCamera}><Plus size={15} /> Add First Camera</button>
          </div>
        ) : (
          <div className="cctv-grid">
            {cameras.map(cam => {
              const bc = BRANCH_COLORS[cam.branch] || {};
              return (
                <div key={cam.id} className={`cctv-card${cam.is_active ? '' : ' cctv-card--disabled'}`}>
                  {/* Card Header */}
                  <div className="cctv-card-header">
                    <div className="cctv-card-header-left">
                      <div className="cctv-card-icon" style={{ background: bc.bg || 'var(--surface)' }}>
                        <Camera size={16} style={{ color: bc.color || 'var(--muted)' }} />
                      </div>
                      <div>
                        <div className="cctv-card-name">{cam.name}</div>
                        <div style={{ marginTop: 3 }}><BranchPill branch={cam.branch} /></div>
                      </div>
                    </div>
                    <div className="cctv-card-actions">
                      <button onClick={() => openEditCamera(cam)} title="Edit" className="cctv-card-action-btn">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDeleteCamera(cam)} title="Delete" className="cctv-card-action-btn cctv-card-action-btn--delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="cctv-card-body">
                    <div className="cctv-card-info">
                      <span className="cctv-card-info-label"><Network size={13} />IP Address</span>
                      <span className="cctv-card-info-value"><code className="cctv-card-code">{cam.ip_address}:{cam.port}</code></span>
                    </div>
                    <div className="cctv-card-info">
                      <span className="cctv-card-info-label"><User size={13} />Username</span>
                      <span className="cctv-card-info-value">{cam.username}</span>
                    </div>
                    <div className="cctv-card-info">
                      <span className="cctv-card-info-label">
                        {cam.is_active ? <Wifi size={13} style={{ color: 'var(--success)' }} /> : <WifiOff size={13} style={{ color: 'var(--error)' }} />}
                        Status
                      </span>
                      <span className={`cctv-card-status${cam.is_active ? ' cctv-card-status--active' : ' cctv-card-status--disabled'}`}>
                        {cam.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="cctv-card-footer">
                    <button
                      onClick={() => { setTab('live'); fetchSnapshot(cam); }}
                      className="cctv-card-footer-btn"
                    >
                      <Eye size={13} /> Live View
                    </button>
                    <button
                      onClick={() => openCameraWebUI(cam)}
                      className="cctv-card-footer-btn"
                    >
                      <ExternalLink size={13} /> Web UI
                    </button>
                    <button
                      onClick={() => toggleCameraActive(cam)}
                      title={cam.is_active ? 'Disable' : 'Enable'}
                      className="cctv-card-toggle-btn"
                      style={{ color: cam.is_active ? 'var(--error)' : 'var(--success)' }}
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
          <div className="cctv-live-selector">
            {cameras.filter(c => c.is_active).map(cam => (
              <button
                key={cam.id}
                className={`cctv-live-pill${liveCamera?.id === cam.id ? ' cctv-live-pill--active' : ''}`}
                onClick={() => fetchSnapshot(cam)}
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
            <div className="cctv-live-layout">
              {/* Snapshot */}
              <div className="card cctv-snapshot-card">
                <div className="cctv-snapshot-header">
                  <div className="cctv-snapshot-header-left">
                    <Camera size={15} style={{ color: 'var(--muted)' }} /> {liveCamera.name}
                    <BranchPill branch={liveCamera.branch} />
                  </div>
                  <div className="cctv-snapshot-header-actions">
                    <button onClick={() => fetchSnapshot(liveCamera)} className="cctv-snapshot-btn">
                      <RefreshCw size={13} className={snapshotLoading ? 'animate-spin' : ''} /> Refresh
                    </button>
                    <button onClick={() => openCameraWebUI(liveCamera)} className="cctv-snapshot-btn">
                      <ExternalLink size={13} /> Full UI
                    </button>
                  </div>
                </div>
                <div className="cctv-snapshot-body">
                  {snapshotLoading ? (
                    <div className="cctv-snapshot-loading">
                      <Loader2 size={36} className="animate-spin cctv-snapshot-spinner" />
                      <span className="cctv-snapshot-loading-text">Connecting to camera…</span>
                    </div>
                  ) : snapshotError ? (
                    <div className="cctv-snapshot-error">
                      <WifiOff size={36} className="cctv-snapshot-error-icon" />
                      <p className="cctv-snapshot-error-text">{snapshotError}</p>
                      <button onClick={() => fetchSnapshot(liveCamera)} className="cctv-snapshot-retry">
                        Retry
                      </button>
                    </div>
                  ) : snapshotUrl ? (
                    <img loading="lazy" src={snapshotUrl} alt="CCTV Snapshot" className="cctv-snapshot-img" />
                  ) : (
                    <div className="cctv-snapshot-idle">Click Refresh to load snapshot</div>
                  )}
                </div>
                <div className="cctv-snapshot-footer">
                  {liveCamera.ip_address} • Click "Full UI" to open camera web interface for live stream
                </div>
              </div>

              {/* Quick attendance panel */}
              <div className="card cctv-attendance-panel">
                <div className="cctv-attendance-header">
                  <UserCheck size={15} style={{ color: 'var(--muted)' }} /> Mark Attendance
                </div>
                <div className="cctv-attendance-body">
                  <div>
                    <label className="label cctv-attendance-label">Branch</label>
                    <BranchSelect className="input-field" value={attendanceBranch || liveCamera.branch} onChange={e => setAttendanceBranch(e.target.value)}>
                      {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </BranchSelect>
                  </div>
                  <div className="cctv-attendance-type-grid">
                    {['entry', 'exit'].map(t => (
                      <button
                        key={t}
                        onClick={() => setAttendanceType(t)}
                        className={`cctv-attendance-type-btn${t === 'entry' ? ` cctv-attendance-type-btn--${attendanceType === t ? 'entry-active' : ''}` : ` cctv-attendance-type-btn--${attendanceType === t ? 'exit-active' : ''}`}`}
                      >
                        {t === 'entry' ? '→ Entry' : '← Exit'}
                      </button>
                    ))}
                  </div>
                  <div>
                    <div className="cctv-staff-section-title">Staff</div>
                    <div className="cctv-staff-list">
                      {staffList.map(s => (
                        <button
                          key={s.id}
                          disabled={markingAttendance === s.id}
                          onClick={() => handleMarkAttendance(s.id)}
                          className="cctv-staff-btn"
                        >
                          <div className="cctv-staff-avatar">
                            {s.image_url ? <SecureImage src={s.image_url} alt={s.name} width={28} height={28} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={13} />}
                          </div>
                          <span className="cctv-staff-name">{s.name}</span>
                          {markingAttendance === s.id
                            ? <Loader2 size={13} className="animate-spin" style={{ color: 'var(--muted)' }} />
                            : <ChevronRight size={12} className="cctv-staff-chevron" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : cameras.filter(c => c.is_active).length > 0 && (
            <div className="card cctv-select-placeholder">
              <MonitorPlay size={40} className="cctv-select-placeholder-icon" />
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
          <div className="cctv-loading">
            <Loader2 size={24} className="animate-spin" style={{ display: 'inline-block', marginRight: 8 }} /> Loading…
          </div>
        ) : (
          <div className="cctv-face-layout">
            <div className="card cctv-face-table-card">
              <div className="cctv-face-table-header">
                <UserCheck size={15} style={{ color: 'var(--muted)' }} /> Staff Face Data
              </div>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr><th>Staff</th><th>Face Images</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {faceStats.map(s => (
                      <tr key={s.staff_id} className={selectedStaffFace === s.staff_id ? 'selected-row' : ''}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div className="cctv-face-staff-avatar">
                              {s.staff_image ? <SecureImage src={s.staff_image} alt={s.name} width={32} height={32} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={14} />}
                            </div>
                            <span style={{ fontWeight: 500, fontSize: 13 }}>{s.name}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`cctv-face-count-badge${s.face_count > 0 ? ' cctv-face-count-badge--has' : ' cctv-face-count-badge--none'}`}>
                            <Image size={11} /> {s.face_count} {s.face_count === 1 ? 'image' : 'images'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => fetchFaceDataForStaff(s.staff_id)} className="cctv-face-table-btn">
                              <Eye size={12} /> View
                            </button>
                            <button onClick={() => openFaceUpload(s.staff_id)} className="cctv-face-table-btn">
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
              <div className="card cctv-face-photos-card">
                <div className="cctv-face-photos-header">
                  <span className="cctv-face-photos-title">
                    {faceStats.find(s => s.staff_id === selectedStaffFace)?.name || 'Staff'} — Photos
                  </span>
                  <div className="cctv-face-photos-actions">
                    <button onClick={() => openFaceUpload(selectedStaffFace)} className="cctv-face-table-btn">
                      <Upload size={12} /> Add
                    </button>
                    <button onClick={() => { setSelectedStaffFace(null); setFaceData([]); }} className="cctv-modal-close">
                      <X size={15} />
                    </button>
                  </div>
                </div>
                <div className="cctv-face-photos-body">
                  {faceData.length === 0 ? (
                    <div className="cctv-face-empty">
                      <Image size={32} className="cctv-face-empty-icon" />
                      <p style={{ fontSize: 13 }}>No face images yet</p>
                      <button onClick={() => openFaceUpload(selectedStaffFace)} className="btn btn-primary" style={{ marginTop: 10, fontSize: 12 }}>
                        <Upload size={13} /> Upload First Image
                      </button>
                    </div>
                  ) : (
                    <div className="cctv-face-grid">
                      {faceData.map(fd => (
                        <div key={fd.id} className="cctv-face-item">
                          <SecureImage src={fd.image_url} alt={fd.label || 'Face'} className="cctv-face-item-img" />
                          <div className="cctv-face-item-info">
                            <div className="cctv-face-item-label">{fd.label || '—'}</div>
                            <div className="cctv-face-item-date">{new Date(fd.created_at).toLocaleDateString()}</div>
                          </div>
                          <button onClick={() => handleDeleteFaceData(fd.id)} className="cctv-face-item-delete" title="Remove">
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
          <div className="modal cctv-modal">
            <div className="cctv-modal-header">
              <div className="cctv-modal-header-left">
                <div className="cctv-modal-header-icon">
                  <Camera size={17} />
                </div>
                <div>
                  <h2 className="cctv-modal-title">{editingCamera ? 'Edit Camera' : 'Add Camera'}</h2>
                  <p className="cctv-modal-subtitle">Configure IP camera credentials</p>
                </div>
              </div>
              <button className="cctv-modal-close" onClick={() => setShowCameraModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCameraSave}>
              <div className="cctv-modal-form">
                <div className="cctv-modal-form-row">
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

                <div className="cctv-modal-section">
                  <span className="cctv-modal-section-line"><Network size={13} /> Network</span>
                  <div className="cctv-modal-section-divider" />
                </div>

                <div className="cctv-modal-form-row">
                  <div>
                    <label className="label">IP Address <span style={{ color: 'var(--error)' }}>*</span></label>
                    <input className="input-field" placeholder="192.168.1.125" value={cameraForm.ip_address} onChange={e => setCameraForm(f => ({ ...f, ip_address: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="label">RTSP Port</label>
                    <input className="input-field" type="number" value={cameraForm.port} onChange={e => setCameraForm(f => ({ ...f, port: parseInt(e.target.value) || 554 }))} />
                  </div>
                </div>

                <div>
                  <label className="label">RTSP Stream Path</label>
                  <input className="input-field" placeholder="/Streaming/Channels/101" value={cameraForm.rtsp_path} onChange={e => setCameraForm(f => ({ ...f, rtsp_path: e.target.value }))} />
                  <p className="cctv-modal-hint">Hikvision default: <code>/Streaming/Channels/101</code></p>
                </div>

                <div className="cctv-modal-section">
                  <span className="cctv-modal-section-line"><KeyRound size={13} /> Credentials</span>
                  <div className="cctv-modal-section-divider" />
                </div>

                <div className="cctv-modal-form-row">
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

              <div className="cctv-modal-footer">
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
          <div className="modal cctv-face-modal">
            <div className="cctv-face-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="cctv-face-modal-icon">
                  <UserCheck size={17} color="var(--on-accent)" />
                </div>
                <div>
                  <h2 className="cctv-modal-title">Upload Face Image</h2>
                  <p className="cctv-modal-subtitle">Add a photo for face recognition</p>
                </div>
              </div>
              <button className="cctv-modal-close" onClick={() => setShowFaceModal(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleFaceUpload}>
              <div className="cctv-modal-form">
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

                <div>
                  <label className="label">Photo <span style={{ color: 'var(--error)' }}>*</span></label>
                  <label className={`cctv-face-upload-zone${facePreview ? ' cctv-face-upload-zone--has-preview' : ''}`}>
                    {facePreview ? (
                      <img loading="lazy" src={facePreview} alt="Preview" className="cctv-face-preview-img" />
                    ) : (
                      <>
                        <div className="cctv-face-upload-icon-wrap">
                          <Upload size={18} style={{ color: 'var(--muted)' }} />
                        </div>
                        <span className="cctv-face-upload-text">Click to upload a photo</span>
                        <span className="cctv-face-upload-hint">JPG, PNG or WEBP, max 5MB</span>
                      </>
                    )}
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFaceFileChange} style={{ display: 'none' }} required />
                  </label>
                  {facePreview && (
                    <button type="button" onClick={() => { setFaceFile(null); setFacePreview(''); }} className="cctv-face-remove-btn">
                      <X size={12} /> Remove photo
                    </button>
                  )}
                </div>
              </div>

              <div className="cctv-face-modal-footer">
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

export default CCTVManagement;
