import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Box, FileText, Package } from 'lucide-react';
import api from '../services/api';
import './InventoryModern.css';

const tabs = [
    { label: 'General Inventory', icon: Box, path: '/dashboard/inventory', key: 'general' },
    { label: 'Paper Inventory', icon: FileText, path: '/dashboard/inventory/paper', key: 'paper' },
    { label: 'Consumable Inventory', icon: Package, path: '/dashboard/inventory/consumables', key: 'consumables' },
];

const InventoryLayout = () => {
    const location = useLocation();
    const [counts, setCounts] = useState({ general: 0, paper: 0, consumables: 0 });

    useEffect(() => {
        const fetchCounts = async () => {
            try {
                const [prodRes, paperRes, consRes] = await Promise.all([
                    api.get('/inventory', { params: { limit: 1, page: 1 } }),
                    api.get('/inventory/paper'),
                    api.get('/inventory/consumables'),
                ]);
                const prodTotal = Array.isArray(prodRes.data) ? prodRes.data.length : (prodRes.data?.total || 0);
                const paperList = Array.isArray(paperRes.data) ? paperRes.data : (paperRes.data?.data || []);
                const consList = Array.isArray(consRes.data) ? consRes.data : (consRes.data?.data || []);
                setCounts({
                    general: Number(prodTotal),
                    paper: paperList.length,
                    consumables: consList.length,
                });
            } catch {
                // counts silently default to 0
            }
        };
        fetchCounts();
    }, []);

    const isActiveTab = (tab) =>
        location.pathname === tab.path ||
        (tab.path === '/dashboard/inventory' && location.pathname === '/dashboard/inventory');

    return (
        <div className="stack-lg">
            <div className="inv-tabs">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    const active = isActiveTab(tab);
                    return (
                        <NavLink
                            key={tab.path}
                            to={tab.path}
                            end={tab.path === '/dashboard/inventory'}
                            className={`inv-tab ${active ? 'inv-tab--active' : ''}`}
                        >
                            <div className="inv-tab-icon">
                                <Icon size={20} />
                            </div>
                            <div className="inv-tab-info">
                                <span className="inv-tab-label">{tab.label}</span>
                                <span className="inv-tab-count">{counts[tab.key]} Items</span>
                            </div>
                        </NavLink>
                    );
                })}
            </div>
            <Outlet />
        </div>
    );
};

export default React.memo(InventoryLayout);
