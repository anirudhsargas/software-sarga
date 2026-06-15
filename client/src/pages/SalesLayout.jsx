import React from 'react';
import { useSEO } from '../hooks/useSEO';
import { Outlet, NavLink } from 'react-router-dom';
import { TrendingUp, UserSquare, ClipboardList, Receipt, FileText, Wallet } from 'lucide-react';
import './SalesLayout.css';
import useTranslation from '../hooks/useTranslation';

const SalesLayout = () => {
    useSEO('Sales Workspace');
    const { t } = useTranslation();

    const tabs = [
        { name: t('customers', 'Customers'), path: 'customers', icon: UserSquare },
        { name: t('orders', 'Orders'), path: 'orders', icon: ClipboardList },
        { name: t('quotes_estimates', 'Quotations'), path: 'quotes', icon: Receipt },
        { name: t('invoices', 'Invoices'), path: 'invoices', icon: FileText },
        { name: t('payments', 'Payments'), path: 'payments', icon: Wallet }
    ];

    return (
        <div className="sales-layout-container">
            <div className="sales-tabs">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <NavLink
                            key={tab.path}
                            to={tab.path}
                            className={({ isActive }) => `sales-tab ${isActive ? 'active' : ''}`}
                        >
                            <Icon className="sales-tab-icon" />
                            <span>{tab.name}</span>
                        </NavLink>
                    );
                })}
            </div>
            <div className="sales-content">
                <Outlet />
            </div>
        </div>
    );
};

export default React.memo(SalesLayout);
