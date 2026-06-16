import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useSEO } from '../../hooks/useSEO';
import { PenTool, Image as ImageIcon, Clock, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

const DesignDashboard = () => {
    useSEO('Design Studio');

    const { data: bookings, isLoading: bookingsLoading } = useQuery({
        queryKey: ['designer_bookings'],
        queryFn: async () => {
            const res = await api.get('/design-workspace/bookings');
            return res.data;
        }
    });

    const { data: assets, isLoading: assetsLoading } = useQuery({
        queryKey: ['designer_assets'],
        queryFn: async () => {
            const res = await api.get('/design-workspace/assets');
            return res.data;
        }
    });

    const myBookings = bookings?.filter(b => b.status === 'Designing' || b.status === 'Assigned') || [];
    const pendingReviews = bookings?.filter(b => b.status === 'Review') || [];
    const recentAssets = assets?.slice(0, 5) || [];

    return (
        <div className="container-lg">
            <h1 className="section-title">Design Studio Overview</h1>
            <p className="section-subtitle mb-24">Manage your design queue and creative assets.</p>

            <div className="grid grid-4 mb-24">
                <div className="card stat-card" style={{ padding: '20px' }}>
                    <div className="stat-card__icon" style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                        <PenTool size={24} />
                    </div>
                    <div>
                        <div className="stat-card__value">{myBookings.length}</div>
                        <div className="stat-card__label">Active Designs</div>
                    </div>
                </div>

                <div className="card stat-card" style={{ padding: '20px' }}>
                    <div className="stat-card__icon" style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                        <Clock size={24} />
                    </div>
                    <div>
                        <div className="stat-card__value">{pendingReviews.length}</div>
                        <div className="stat-card__label">Pending Review</div>
                    </div>
                </div>

                <div className="card stat-card" style={{ padding: '20px' }}>
                    <div className="stat-card__icon" style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                        <CheckCircle size={24} />
                    </div>
                    <div>
                        <div className="stat-card__value">{bookings?.filter(b => b.status === 'Approved').length || 0}</div>
                        <div className="stat-card__label">Approved (This Month)</div>
                    </div>
                </div>

                <div className="card stat-card" style={{ padding: '20px' }}>
                    <div className="stat-card__icon" style={{ backgroundColor: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}>
                        <ImageIcon size={24} />
                    </div>
                    <div>
                        <div className="stat-card__value">{assets?.length || 0}</div>
                        <div className="stat-card__label">Total Assets</div>
                    </div>
                </div>
            </div>

            <div className="grid grid-2">
                <div className="card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h2 className="section-title" style={{ margin: 0, fontSize: '18px' }}>My Design Queue</h2>
                        <Link to="/designer/bookings" className="btn-text">View All</Link>
                    </div>

                    {bookingsLoading ? (
                        <p className="text-muted">Loading queue...</p>
                    ) : myBookings.length === 0 ? (
                        <div className="empty-state">
                            <p>No active designs in your queue.</p>
                        </div>
                    ) : (
                        <div className="stack-sm">
                            {myBookings.map(b => (
                                <div key={b.id} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: '500' }}>{b.customer_name} ({b.company_name})</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Due: {new Date(b.due_date).toLocaleDateString()}</div>
                                    </div>
                                    <span style={{ 
                                        padding: '4px 8px', borderRadius: '12px', fontSize: '12px',
                                        backgroundColor: b.priority === 'High' || b.priority === 'Urgent' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)',
                                        color: b.priority === 'High' || b.priority === 'Urgent' ? '#ef4444' : '#3b82f6'
                                    }}>
                                        {b.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h2 className="section-title" style={{ margin: 0, fontSize: '18px' }}>Recent Library Assets</h2>
                        <Link to="/designer/library" className="btn-text">Open Library</Link>
                    </div>

                    {assetsLoading ? (
                        <p className="text-muted">Loading assets...</p>
                    ) : recentAssets.length === 0 ? (
                        <div className="empty-state">
                            <p>No assets uploaded yet.</p>
                        </div>
                    ) : (
                        <div className="stack-sm">
                            {recentAssets.map(a => (
                                <div key={a.id} style={{ display: 'flex', gap: '12px', padding: '8px', borderBottom: '1px solid var(--border)' }}>
                                    {a.preview_url ? (
                                        <img src={`/${a.preview_url}`} alt={a.asset_name} style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{ width: '40px', height: '40px', borderRadius: '4px', backgroundColor: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <ImageIcon size={20} color="var(--text-muted)" />
                                        </div>
                                    )}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: '500', fontSize: '14px' }}>{a.asset_name}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Uploaded by {a.uploaded_by_name}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DesignDashboard;
