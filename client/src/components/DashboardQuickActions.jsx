import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine, Wallet, IndianRupee, CalendarCheck, Keyboard } from 'lucide-react';

const QUICK_ACTIONS = [
  {
    id: 'scan',
    label: 'Scan Item',
    icon: ScanLine,
    route: '/dashboard/inventory/scan',
    color: '#8b5cf6'
  },
  {
    id: 'payment',
    label: 'Payment',
    icon: Wallet,
    route: '/dashboard/sales/payments',
    color: 'var(--success)'
  },
  {
    id: 'expense',
    label: 'Expense',
    icon: IndianRupee,
    route: '/dashboard/expenses',
    color: 'var(--warning)'
  },
  {
    id: 'attendance',
    label: 'Attendance',
    icon: CalendarCheck,
    route: '/dashboard/staff',
    color: 'var(--primary)'
  },
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    icon: Keyboard,
    route: '/dashboard/shortcuts',
    color: 'var(--accent)'
  }
];

const DashboardQuickActions = () => {
  const navigate = useNavigate();

  return (
    <div className="fo-quick-actions">
      <div className="fo-quick-actions__grid">
        {QUICK_ACTIONS.map(s => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              className="fo-quick-action-card"
              onClick={() => navigate(s.route)}
              title={s.label}
            >
              <div
                className="fo-quick-action-card__icon"
                style={{ background: `color-mix(in srgb, ${s.color} 14%, transparent)`, color: s.color }}
              >
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
