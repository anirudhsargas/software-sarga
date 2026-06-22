import { useState, useEffect } from 'react';
import { Users, X, Plus, CheckCircle2, Loader2 } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const ASSIGNABLE_ROLES = ['Designer', 'Printer', 'Front Office', 'Other Staff'];
const ROLE_ASSIGNABLE = ['Designer', 'Printer', 'Front Office', 'Other Staff', 'Accountant'];

function AssignStaff({ jobId, currentAssignments = [], onAssigned, canAssign }) {
  const [staffList, setStaffList] = useState([]);
  const [roleFilter, setRoleFilter] = useState('all');
  const [assignMode, setAssignMode] = useState('staff');
  const [selectedStaff, setSelectedStaff] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get('/staff')
      .then(res => {
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : res.data.data || [];
        setStaffList(list);
        setFetching(false);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Failed to load staff list');
          setFetching(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const assignedStaffIds = new Set(
    (currentAssignments || []).filter(a => a.staff_id != null).map(a => a.staff_id)
  );

  const filteredStaff = staffList.filter(s =>
    ASSIGNABLE_ROLES.includes(s.role) &&
    (roleFilter === 'all' || s.role === roleFilter) &&
    !assignedStaffIds.has(s.id)
  );

  const uniqueRoles = [...new Set(staffList
    .filter(s => ASSIGNABLE_ROLES.includes(s.role))
    .map(s => s.role)
  )];

  const handleAssign = async () => {
    if (assignMode === 'staff') {
      if (!selectedStaff) {
        toast.error('Please select a staff member');
        return;
      }
    } else {
      if (!selectedRole) {
        toast.error('Please select a role');
        return;
      }
    }

    setLoading(true);
    try {
      const payload = assignMode === 'staff'
        ? { assign_type: 'staff', staff_id: selectedStaff }
        : { assign_type: 'role', role: selectedRole };

      const res = await api.post(`/jobs/${jobId}/assign`, payload);
      toast.success('Assigned successfully');
      setSelectedStaff('');
      setSelectedRole('');
      if (onAssigned) onAssigned(res.data.assignments);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to assign');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (userId) => {
    if (!window.confirm('Remove this assignment?')) return;
    try {
      const res = await api.delete(`/jobs/${jobId}/assign/${userId}`);
      toast.success('Assignment removed');
      if (onAssigned) onAssigned(res.data.assignments);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to remove');
    }
  };

  return (
    <div className="assign-staff">
      {canAssign && (
        <>
          <div className="assign-mode-toggle">
            <label style={{ marginRight: 16, fontWeight: 500 }}>
              <input
                type="radio"
                name="assignMode"
                checked={assignMode === 'staff'}
                onChange={() => setAssignMode('staff')}
                style={{ marginRight: 4 }}
              />
              Individual Staff
            </label>
            <label style={{ fontWeight: 500 }}>
              <input
                type="radio"
                name="assignMode"
                checked={assignMode === 'role'}
                onChange={() => setAssignMode('role')}
                style={{ marginRight: 4 }}
              />
              Entire Role
            </label>
          </div>

          <div className="assign-controls" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}>
            {assignMode === 'staff' ? (
              <>
                <div className="form-group" style={{ minWidth: 160 }}>
                  <label className="form-label" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Filter by role</label>
                  <select
                    className="form-input"
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                  >
                    <option value="all">All Roles</option>
                    {uniqueRoles.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ minWidth: 200, flex: 1 }}>
                  <label className="form-label" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Select staff</label>
                  <select
                    className="form-input"
                    value={selectedStaff}
                    onChange={(e) => setSelectedStaff(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                  >
                    <option value="">-- Select Staff --</option>
                    {filteredStaff.map(s => (
                      <option key={s.id} value={s.id}>{s.name} &middot; {s.role}</option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <div className="form-group" style={{ minWidth: 200, flex: 1 }}>
                <label className="form-label" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Select role</label>
                <select
                  className="form-input"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                >
                  <option value="">-- Select Role --</option>
                  {ROLE_ASSIGNABLE.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              className="btn btn-primary btn-sm"
              onClick={handleAssign}
              disabled={loading || (assignMode === 'staff' ? !selectedStaff : !selectedRole)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, height: 34, padding: '0 16px', whiteSpace: 'nowrap' }}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Assign
            </button>
          </div>
        </>
      )}

      <div className="assigned-list" style={{ marginTop: 16 }}>
        <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--muted)' }}>
          Currently Assigned
        </h4>
        {fetching ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13 }}>
            <Loader2 size={14} className="animate-spin" /> Loading staff...
          </div>
        ) : currentAssignments.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, fontStyle: 'italic' }}>
            No staff assigned yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {currentAssignments.map(a => (
              <div
                key={a.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)'
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 'bold', fontSize: 12,
                  background: 'var(--accent)', color: 'var(--on-accent)',
                  flexShrink: 0
                }}>
                  {a.staff_name ? a.staff_name.charAt(0).toUpperCase() : '?'}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>
                    {a.staff_name || `Any ${a.role || a.staff_role || 'Staff'}`}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {a.staff_role || a.role || 'Assigned'}
                    {a.status ? ` · ${a.status}` : ''}
                  </span>
                </div>
                {a.status === 'Completed' && <CheckCircle2 size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />}
                {canAssign && a.staff_id != null && (
                  <button
                    onClick={() => handleRemove(a.staff_id)}
                    title="Remove assignment"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--error)', padding: 4, display: 'flex',
                      flexShrink: 0
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AssignStaff;
