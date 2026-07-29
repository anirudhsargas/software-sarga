import React, { useState, useEffect, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, TrendingUp, Receipt, Users, Building2, 
  ShoppingCart, CreditCard, BookOpen, Landmark, Activity,
  FileText, CheckSquare, Calendar, BarChart2, Settings,
  ChevronLeft, ChevronRight, DollarSign, UserCheck, Camera, Clock, Wallet, Grid
} from 'lucide-react';
import useAuth from '../../hooks/useAuth';
import SidebarThemeToggle from '../SidebarThemeToggle';
import './AccountantSidebar.css';

const LINKS = [
  { to: '/accounting/dashboard', icon: LayoutDashboard, label: 'Dashboard', key: 'dashboard' },
  { to: '/accounting/income', icon: TrendingUp, label: 'Income', key: 'finance' },
  { to: '/accounting/expenses', icon: Receipt, label: 'Expenses', key: 'finance' },
  { to: '/accounting/vendors', icon: Building2, label: 'Vendors', key: 'finance' },
  { to: '/accounting/customers', icon: Users, label: 'Customers', key: 'customers' },
  { to: '/accounting/products', icon: Grid, label: 'Product Library', key: 'operations' },
  { to: '/accounting/purchases', icon: ShoppingCart, label: 'Purchases', key: 'billing' },
  { to: '/accounting/payments', icon: CreditCard, label: 'Payments', key: 'billing' },
  { to: '/accounting/ledger', icon: BookOpen, label: 'Ledger', key: 'internal' },
  { to: '/accounting/banks', icon: Landmark, label: 'Bank Accounts', key: 'internal' },
  { to: '/accounting/transactions', icon: Activity, label: 'Transactions', key: 'internal' },
  { to: '/accounting/bills', icon: Wallet, label: 'Bills', key: 'billing' },
  { to: '/accounting/approvals', icon: CheckSquare, label: 'Approvals', key: 'operations' },
  { to: '/accounting/daily-book', icon: Calendar, label: 'Daily Book', key: 'reports' },
  { to: '/accounting/salary', icon: DollarSign, label: 'Salary & Payroll', key: 'finance' },
  { to: '/accounting/attendance-records', icon: UserCheck, label: 'Attendance Records', key: 'operations' },
  { to: '/accounting/reports', icon: BarChart2, label: 'Financial Reports', key: 'reports' },
  { to: '/accounting/settings', icon: Settings, label: 'Settings', key: 'manage' }
];

export default function AccountantSidebar({ isOpen, onClose }) {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('acc_sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('acc_sidebar_collapsed', collapsed);
  }, [collapsed]);

  const filteredLinks = useMemo(() => {
    if (!user?.settings) return LINKS;
    try {
      const settings = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
      if (settings.sidebar) {
        return LINKS.filter(link => {
          if (settings.sidebar[link.key] === false) return false;
          if (link.key === 'finance' && settings.sidebar.expenses === false && (link.label === 'Expenses' || link.label === 'Vendors')) return false;
          return true;
        });
      }
    } catch (e) {
      console.error('Error parsing accountant sidebar settings:', e);
    }
    return LINKS;
  }, [user]);

  return (
    <aside className={`acc-sidebar ${collapsed ? 'collapsed' : ''} ${isOpen ? 'open' : ''}`}>
      <div className="acc-sidebar-header">
        {!collapsed && <div className="acc-logo">Finance</div>}
        <button className="acc-toggle-btn" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="acc-nav">
        {filteredLinks.map(link => (
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
      <div style={{ marginTop: 'auto', borderTop: collapsed ? 'none' : '1px solid var(--border)' }}>
        <SidebarThemeToggle collapsed={collapsed} />
      </div>
    </aside>
  );
}
