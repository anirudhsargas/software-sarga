import React from 'react';
import { useBranches } from '../../contexts/BranchContext';
import { toast } from 'react-hot-toast';
import { Building2 } from 'lucide-react';

const BranchSelect = ({ children, className, style, ...props }) => {
    const { isFrontOffice, assignedBranchName } = useBranches();

    if (isFrontOffice) {
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
                <span>Current Branch: <strong>{assignedBranchName || 'Assigned Branch'}</strong></span>
                <span style={{ fontSize: '10px', background: 'var(--border)', padding: '2px 4px', borderRadius: '4px', marginLeft: '4px' }}>Read Only</span>
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
