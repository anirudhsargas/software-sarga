import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, ScanLine, Search, Wallet, IndianRupee, Truck, FileText, Printer, Clock, UserPlus, CalendarCheck
} from 'lucide-react';

const QUICK_ACTIONS = [
  {
    id: 'new-order',
    label: 'New Order',
    icon: Plus,
    route: '/dashboard/sales/invoices',
    state: { action: 'create' },
    color: 'var(--accent)',
    primary: true,
    shortcut: 'Alt+N'
  },
  {
    id: 'scan',
    label: 'Scan Item',
    icon: ScanLine,
    route: '/dashboard/inventory/scan',
    color: '#8b5cf6'
  },
  {
    id: 'customer-search',
    label: 'Customer',
    icon: Search,
    route: '/dashboard/customers',
    color: 'var(--info)'
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
    id: 'delivery',
    label: 'Delivery',
    icon: Truck,
    route: '/dashboard/sales/delivery',
    color: 'var(--primary)'
  },
  {
    id: 'quotation',
    label: 'Quotations',
    icon: FileText,
    route: '/dashboard/sales/quotes',
    color: 'var(--info)'
  },
  {
    id: 'reprint',
    label: 'Reprint',
    icon: Printer,
    route: '/dashboard/sales/invoices',
    color: '#ec4899'
  },
  {
    id: 'recent-orders',
    label: 'Recent Jobs',
    icon: Clock,
    route: '/dashboard/jobs',
    color: 'var(--accent)'
  },
  {
    id: 'add-customer',
    label: 'Add Customer',
    icon: UserPlus,
    route: '/dashboard/customers/new',
    color: 'var(--success)'
  },
  {
    id: 'attendance',
    label: 'Attendance',
    icon: CalendarCheck,
    route: '/dashboard/daily-report',
    color: 'var(--primary)'
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
              className={`fo-quick-action-card ${s.primary ? 'fo-quick-action-card--primary' : ''}`}
              onClick={() => navigate(s.route, s.state ? { state: s.state } : undefined)}
              title={`${s.label}${s.shortcut ? ` (${s.shortcut})` : ''}`}
            >
              <div
                className="fo-quick-action-card__icon"
                style={{ background: `color-mix(in srgb, ${s.color} 14%, transparent)`, color: s.color }}
              >
                <Icon size={20} />
              </div>
              <span className="fo-quick-action-card__label">{s.label}</span>
              {s.shortcut && <span className="fo-quick-action-card__shortcut">{s.shortcut}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default memo(DashboardQuickActions);
