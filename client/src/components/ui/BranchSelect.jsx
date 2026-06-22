import React from 'react';
import { useBranches } from '../../contexts/BranchContext';
import { toast } from 'react-hot-toast';
import auth from '../../services/auth';

const BranchSelect = ({ children, className, style, ...props }) => {
    const { getBranchName } = useBranches();
    const user = auth.getUser();
    const isAdmin = ['admin', 'super_admin'].includes(user?.role?.toLowerCase());

    if (!isAdmin) {
        const assignedBranchId = user?.branch_id;
        const branchName = getBranchName(assignedBranchId) || user?.branch_short_name || 'Assigned Branch';

        return (
            <div 
                className={`readonly-branch ${className || ''}`}
                style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: 'var(--surface2)',
                    color: 'var(--text-muted)', cursor: 'not-allowed',
                    opacity: 0.9,
                    ...style
                }}
                onClick={() => toast('Your account is restricted to your assigned branch.', { icon: '🔒' })}
                title="Branch is restricted for your role"
            >
                <span>Current Branch: <strong>{branchName}</strong></span>
                <span style={{ fontSize: '10px', background: 'var(--border)', padding: '2px 4px', borderRadius: '4px', marginLeft: '4px' }}>Read Only</span>
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
