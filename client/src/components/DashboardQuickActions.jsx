import { memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { IndianRupee, ArrowLeftRight, FileText, ScanLine, Camera, Printer, Settings } from 'lucide-react';
import auth from '../services/auth';

const DEFAULT_SHORTCUTS = [
    { id: 'expense', label: 'Expense', icon: IndianRupee, route: '/dashboard/expenses', color: 'var(--warning)' },
    { id: 'transfer', label: 'Transfer', icon: ArrowLeftRight, route: '/dashboard/stock-transfer', color: 'var(--success)' },
    { id: 'bill', label: 'Bill', icon: FileText, route: '/dashboard/sales/invoices', state: { action: 'create' }, color: 'var(--danger)' },
    { id: 'inventory', label: 'Scan', icon: ScanLine, route: '/dashboard/inventory/scan', color: '#8b5cf6' },
    { id: 'screenshot', label: 'Screenshot', icon: Camera, route: '/dashboard/screenshot', color: 'var(--info)' },
    { id: 'print_label', label: 'Print Label', icon: Printer, route: '/dashboard/inventory', color: 'var(--primary)' },
    { id: 'machines', label: 'Machines', icon: Settings, route: '/dashboard/machines', color: 'var(--accent)' },
];

const ADMIN_ONLY = new Set(['transfer', 'inventory']);
const FO_ONLY = new Set(['expense', 'bill']);

const DashboardQuickActions = () => {
    const navigate = useNavigate();
    const user = auth.getUser();
    const isAdmin = user?.role === 'Admin';

    const visibleShortcuts = useMemo(() => {
        if (isAdmin) return DEFAULT_SHORTCUTS;
        if (user?.role === 'Front Office') {
            return DEFAULT_SHORTCUTS.filter(s => !ADMIN_ONLY.has(s.id));
        }
        return DEFAULT_SHORTCUTS.filter(s => !ADMIN_ONLY.has(s.id) && !FO_ONLY.has(s.id));
    }, [isAdmin, user?.role]);

    return (
        <div className="fo-quick-actions">
            <div className="fo-quick-actions__label">Quick Actions</div>
            <div className="fo-quick-actions__grid">
                {visibleShortcuts.map(s => {
                    const Icon = s.icon;
                    return (
                        <button
                            key={s.id}
                            className="fo-quick-action-card"
                            onClick={() => navigate(s.route, s.state ? { state: s.state } : undefined)}
                            title={s.label}
                        >
                            <div className="fo-quick-action-card__icon" style={{ background: `color-mix(in srgb, ${s.color} 12%, transparent)`, color: s.color }}>
                                <Icon size={20} />
                            </div>
                            <span className="fo-quick-action-card__label">{s.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default memo(DashboardQuickActions);
