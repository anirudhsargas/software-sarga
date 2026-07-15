import React from 'react';
import { useBranches } from '../../contexts/BranchContext';
import { toast } from 'react-hot-toast';
import auth from '../../services/auth';

const ADMIN_ROLES = ['admin', 'super_admin'];

const BranchSelect = ({ children, className, style, ...props }) => {
    const { getBranchName, assignedBranches } = useBranches();
    const user = auth.getUser();
    const isAdmin = ADMIN_ROLES.includes(user?.role?.toLowerCase());
    const hasMultipleBranches = assignedBranches && assignedBranches.length > 1;

    if (!isAdmin && !hasMultipleBranches) {
        const assignedBranchId = user?.branch_id;
        const branchName = getBranchName(assignedBranchId) || user?.branch_short_name || 'Assigned Branch';

        return (
            <div 
                className={`readonly-branch ${className || ''}`}
                style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: 'var(--surface-2, var(--surface2))',
                    color: 'var(--text-muted)', cursor: 'not-allowed',
                    opacity: 0.9,
                    fontSize: '0.85rem',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid var(--border)',
                    ...style
                }}
                onClick={() => toast('Your account is restricted to your assigned branch.', { icon: '🔒' })}
                title="Branch is restricted for your role"
            >
                <span>Branch: <strong>{branchName}</strong></span>
                <input type="hidden" name="branch_id" value={assignedBranchId || ''} />
            </div>
        );
    }

    return (
        <select className={className} style={style} {...props}>
            {children}
        </select>
    );
};

export default BranchSelect;
