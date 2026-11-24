import React, { useEffect, useMemo, useState } from 'react';
import { KeyRound, Loader2, Save, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import PageContainer from '../../components/ui/PageContainer';
import { usePageTitle } from '../../hooks/usePageTitle';
import useRolePermissions, { setRolePermissionsLocal } from '../../hooks/useRolePermissions';
import { CONFIGURABLE_ROLES, PERMISSION_GROUPS, PERMISSION_MODULES } from '../../config/rolePermissions';
import './RolePermissions.css';

// Draft shape: { [role]: { [moduleId]: boolean } } — only modules that differ from the built-in default.
const cloneOverrides = (overrides) => {
    const out = {};
    for (const role of CONFIGURABLE_ROLES) out[role] = { ...(overrides?.[role] || {}) };
    return out;
};

const sameOverrides = (a, b) => CONFIGURABLE_ROLES.every(role => {
    const x = a[role] || {}; const y = b[role] || {};
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) if (x[k] !== y[k]) return false;
    return true;
});

const isDefault = (role, mod) => mod.defaultRoles.includes(role);

const effective = (overrides, role, mod) => {
    const o = overrides[role]?.[mod.id];
    return typeof o === 'boolean' ? o : isDefault(role, mod);
};

const RolePermissions = () => {
    usePageTitle('Permissions');
    const { overrides, loaded, refresh } = useRolePermissions();
    const [saved, setSaved] = useState(() => cloneOverrides(overrides));
    const [draft, setDraft] = useState(() => cloneOverrides(overrides));
    const [saving, setSaving] = useState(false);

    // Always load the freshest copy when the page opens.
    useEffect(() => { refresh(); }, [refresh]);

    useEffect(() => {
        const next = cloneOverrides(overrides);
        setSaved(next);
        setDraft(next);
    }, [overrides]);

    const dirty = useMemo(() => !sameOverrides(saved, draft), [saved, draft]);

    const grouped = useMemo(() => PERMISSION_GROUPS
        .map(g => ({ ...g, modules: PERMISSION_MODULES.filter(m => m.group === g.key) }))
        .filter(g => g.modules.length > 0), []);

    const setCell = (role, mod, value) => {
        setDraft(prev => {
            const roleMap = { ...prev[role] };
            // Store only differences from the built-in access, so defaults stay "live".
            if (value === isDefault(role, mod)) delete roleMap[mod.id];
            else roleMap[mod.id] = value;
            return { ...prev, [role]: roleMap };
        });
    };

    const setRoleBulk = (role, mode) => {
        setDraft(prev => {
            const roleMap = {};
            if (mode !== 'default') {
                const value = mode === 'all';
                PERMISSION_MODULES.forEach(m => { if (value !== isDefault(role, m)) roleMap[m.id] = value; });
            }
            return { ...prev, [role]: roleMap };
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await api.put('/role-permissions', { overrides: draft });
            setRolePermissionsLocal(res.data?.overrides || draft);
            toast.success('Permissions saved. Staff see the change on their next page load.');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save permissions');
        } finally {
            setSaving(false);
        }
    };

    const enabledCount = (role) => PERMISSION_MODULES.filter(m => effective(draft, role, m)).length;
    const extraCount = (role) => PERMISSION_MODULES.filter(m => !isDefault(role, m) && effective(draft, role, m)).length;

    return (
        <PageContainer className="rp-page">
            <div className="rp-header">
                <div className="row gap-sm items-center">
                    <KeyRound size={22} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                    <h1 className="section-title" style={{ margin: 0, fontSize: 22 }}>Role Permissions</h1>
                </div>
                <div className="rp-actions">
                    <button className="btn btn-ghost" onClick={() => setDraft(saved)} disabled={!dirty || saving}>
                        <RotateCcw size={16} aria-hidden="true" /> Discard changes
                    </button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={!dirty || saving}>
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} aria-hidden="true" />}
                        Save permissions
                    </button>
                </div>
            </div>

            {!loaded ? (
                <div className="rp-loading"><Loader2 size={24} className="animate-spin" /> Loading permissions…</div>
            ) : (
                <div className="rp-table-wrap">
                    <table className="rp-table">
                        <thead>
                            <tr>
                                <th scope="col" className="rp-module-col">Module</th>
                                {CONFIGURABLE_ROLES.map(role => (
                                    <th scope="col" key={role}>
                                        <div className="rp-role-head">
                                            <span>{role}</span>
                                            <span className="rp-count">
                                                {enabledCount(role)}/{PERMISSION_MODULES.length}
                                                {extraCount(role) > 0 && <> · {extraCount(role)} extra</>}
                                            </span>
                                            <span className="rp-role-bulk">
                                                <button type="button" onClick={() => setRoleBulk(role, 'default')} title="Reset to built-in access">Default</button>
                                                <button type="button" onClick={() => setRoleBulk(role, 'all')}>All</button>
                                                <button type="button" onClick={() => setRoleBulk(role, 'none')}>None</button>
                                            </span>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {grouped.map(group => (
                                <React.Fragment key={group.key}>
                                    <tr className="rp-group-row">
                                        <th scope="rowgroup" colSpan={CONFIGURABLE_ROLES.length + 1}>{group.label}</th>
                                    </tr>
                                    {group.modules.map(mod => (
                                        <tr key={mod.id}>
                                            <th scope="row" className="rp-module-col">{mod.name}</th>
                                            {CONFIGURABLE_ROLES.map(role => {
                                                const builtIn = isDefault(role, mod);
                                                const on = effective(draft, role, mod);
                                                const changed = on !== effective(saved, role, mod);
                                                const cls = [
                                                    builtIn ? 'rp-cell--default' : 'rp-cell--optional',
                                                    on && !builtIn ? 'rp-cell--extra' : '',
                                                    changed ? 'rp-changed' : '',
                                                ].filter(Boolean).join(' ');
                                                return (
                                                    <td key={role} className={cls}>
                                                        <input
                                                            type="checkbox"
                                                            className="rp-check"
                                                            checked={on}
                                                            onChange={(e) => setCell(role, mod, e.target.checked)}
                                                            aria-label={`${mod.name} for ${role}`}
                                                            title={builtIn ? 'Built-in access for this role' : 'Not in this role\'s built-in access — tick to grant'}
                                                        />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </PageContainer>
    );
};

export default RolePermissions;
