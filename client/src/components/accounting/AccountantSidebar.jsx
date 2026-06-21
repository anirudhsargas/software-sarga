import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, TrendingUp, Receipt, Users, Building2, 
  ShoppingCart, CreditCard, BookOpen, Landmark, Activity,
  FileText, CheckSquare, Calendar, BarChart2, Settings,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import './AccountantSidebar.css';

const LINKS = [
  { to: '/accounting/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/accounting/income', icon: TrendingUp, label: 'Income' },
  { to: '/accounting/expenses', icon: Receipt, label: 'Expenses' },
  { to: '/accounting/vendors', icon: Building2, label: 'Vendors' },
  { to: '/accounting/customers', icon: Users, label: 'Customers' },
  { to: '/accounting/purchases', icon: ShoppingCart, label: 'Purchases' },
  { to: '/accounting/payments', icon: CreditCard, label: 'Payments' },
  { to: '/accounting/ledger', icon: BookOpen, label: 'Ledger' },
  { to: '/accounting/banks', icon: Landmark, label: 'Bank Accounts' },
  { to: '/accounting/transactions', icon: Activity, label: 'Transactions' },
  { to: '/accounting/bills', icon: FileText, label: 'Bills' },
  { to: '/accounting/approvals', icon: CheckSquare, label: 'Approvals' },
  { to: '/accounting/daily-book', icon: Calendar, label: 'Daily Book' },
  { to: '/accounting/reports', icon: BarChart2, label: 'Reports' },
  { to: '/accounting/settings', icon: Settings, label: 'Settings' }
];

export default function AccountantSidebar({ isOpen, onClose }) {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('acc_sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('acc_sidebar_collapsed', collapsed);
  }, [collapsed]);

  return (
    <aside className={`acc-sidebar ${collapsed ? 'collapsed' : ''} ${isOpen ? 'open' : ''}`}>
      <div className="acc-sidebar-header">
        {!collapsed && <div className="acc-logo">Accounting</div>}
        <button className="acc-toggle-btn" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="acc-nav">
        {LINKS.map(link => (
          <NavLink 
            key={link.to} 
            to={link.to} 
            className={({isActive}) => `acc-nav-link ${isActive ? 'active' : ''}`}
            title={collapsed ? link.label : ''}
            onClick={() => onClose?.()}
          >
            <link.icon size={20} className="acc-nav-icon" />
            {!collapsed && <span className="acc-nav-label">{link.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
