import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import auth from '../../services/auth';
import { useSEO } from '../../hooks/useSEO';
import { CheckCircle, Clock, CalendarX, User, Activity } from 'lucide-react';
import PageContainer from '../components/ui/PageContainer';

const StaffDashboard = () => {
    useSEO('Staff Portal - Overview');
    const user = auth.getUser();

    const { data: attendance, isLoading: attendanceLoading } = useQuery({
        queryKey: ['staff_attendance'],
        queryFn: async () => {
            const res = await api.get('/staff-portal/attendance');
            return res.data;
        }
    });

    const { data: timeline, isLoading: timelineLoading } = useQuery({
        queryKey: ['staff_timeline'],
        queryFn: async () => {
            const res = await api.get('/staff-portal/timeline');
            return res.data;
        }
    });

    const { data: tasks, isLoading: tasksLoading } = useQuery({
        queryKey: ['staff_tasks'],
        queryFn: async () => {
            const res = await api.get('/staff-portal/tasks');
            return res.data;
        }
    });

    const pendingTasks = tasks?.filter(t => t.status !== 'Completed') || [];

    return (
        <PageContainer>
            <h1 className="section-title">Welcome back, {user?.name || 'Staff Member'}</h1>
            <p className="section-subtitle mb-20">Here is your current performance overview.</p>

            <div className="grid grid-3 mb-24">
                <div className="card stat-card" style={{ padding: '24px' }}>
                    <div className="stat-card__icon" style={{ backgroundColor: 'rgba(0,192,163,0.1)', color: 'var(--success)' }}>
                        <CheckCircle size={28} />
                    </div>
                    <div>
                        <div className="stat-card__value">{attendanceLoading ? '-' : attendance?.present_days || 0}</div>
                        <div className="stat-card__label">Days Present</div>
                    </div>
                </div>

                <div className="card stat-card" style={{ padding: '24px' }}>
                    <div className="stat-card__icon" style={{ backgroundColor: 'rgba(255,170,0,0.1)', color: 'var(--warning)' }}>
                        <CalendarX size={28} />
                    </div>
                    <div>
                        <div className="stat-card__value">{attendanceLoading ? '-' : attendance?.leave_days || 0}</div>
                        <div className="stat-card__label">Leave Days</div>
                    </div>
                </div>

                <div className="card stat-card" style={{ padding: '24px' }}>
                    <div className="stat-card__icon" style={{ backgroundColor: 'rgba(240,68,56,0.1)', color: 'var(--error)' }}>
                        <Clock size={28} />
                    </div>
                    <div>
                        <div className="stat-card__value">{attendanceLoading ? '-' : attendance?.late_days || 0}</div>
                        <div className="stat-card__label">Late Marks</div>
                    </div>
                </div>
            </div>

            <div className="grid grid-2">
                <div className="card" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                        <CheckCircle size={20} style={{ color: 'var(--primary)' }} />
                        <h2 className="section-title" style={{ margin: 0, fontSize: '18px' }}>Active Tasks ({pendingTasks.length})</h2>
                    </div>
                    
                    {tasksLoading ? (
                        <p className="text-muted">Loading tasks...</p>
                    ) : pendingTasks.length === 0 ? (
                        <div className="empty-state">
                            <p>No active tasks assigned to you right now.</p>
                        </div>
                    ) : (
                        <div className="stack-sm">
                            {pendingTasks.slice(0, 5).map(task => (
                                <div key={task.id} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px' }}>
                                    <h4 style={{ margin: '0 0 4px 0' }}>{task.title}</h4>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                                        <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>
                                        <span style={{ 
                                            padding: '2px 8px', 
                                            borderRadius: '12px', 
                                            backgroundColor: task.priority === 'High' || task.priority === 'Urgent' ? 'var(--error)' : 'var(--surface-3)',
                                            color: task.priority === 'High' || task.priority === 'Urgent' ? 'white' : 'var(--text)'
                                        }}>
                                            {task.priority}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="card" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                        <Activity size={20} style={{ color: 'var(--primary)' }} />
                        <h2 className="section-title" style={{ margin: 0, fontSize: '18px' }}>Recent Activity</h2>
                    </div>

                    {timelineLoading ? (
                        <p className="text-muted">Loading activity...</p>
                    ) : timeline?.length === 0 ? (
                        <div className="empty-state">
                            <p>No recent activity found.</p>
                        </div>
                    ) : (
                        <div className="timeline" style={{ paddingLeft: '10px' }}>
                            {timeline?.map((item, idx) => (
                                <div key={idx} style={{ 
                                    position: 'relative', 
                                    paddingLeft: '20px', 
                                    paddingBottom: '16px',
                                    borderLeft: idx < timeline.length - 1 ? '2px solid var(--border)' : 'none'
                                }}>
                                    <div style={{ 
                                        position: 'absolute', 
                                        left: idx < timeline.length - 1 ? '-5px' : '-5px', 
                                        top: 0, 
                                        width: '10px', 
                                        height: '10px', 
                                        borderRadius: '50%', 
                                        backgroundColor: 'var(--primary)' 
                                    }}></div>
                                    <div style={{ fontSize: '14px', fontWeight: '500' }}>{item.action}</div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                        {item.details && typeof item.details === 'object' ? JSON.stringify(item.details) : item.details}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        {new Date(item.timestamp).toLocaleString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </PageContainer>
    );
};

export default StaffDashboard;
