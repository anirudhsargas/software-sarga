import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useSEO } from '../../hooks/useSEO';
import { CheckSquare, Clock, AlertTriangle, PlayCircle } from 'lucide-react';

const MyTasks = () => {
    useSEO('My Tasks');

    const { data: tasks, isLoading } = useQuery({
        queryKey: ['staff_tasks'],
        queryFn: async () => {
            const res = await api.get('/staff-portal/tasks');
            return res.data;
        }
    });

    const getCount = (status) => tasks?.filter(t => t.status === status).length || 0;

    return (
        <div className="container-lg">
            <h1 className="section-title">My Tasks</h1>
            <p className="section-subtitle mb-24">Manage your assigned duties and track progress.</p>

            <div className="grid grid-4 mb-24">
                <div className="card stat-card" style={{ padding: '20px' }}>
                    <div className="stat-card__icon" style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                        <CheckSquare size={24} />
                    </div>
                    <div>
                        <div className="stat-card__value">{getCount('Assigned')}</div>
                        <div className="stat-card__label">Assigned</div>
                    </div>
                </div>

                <div className="card stat-card" style={{ padding: '20px' }}>
                    <div className="stat-card__icon" style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                        <PlayCircle size={24} />
                    </div>
                    <div>
                        <div className="stat-card__value">{getCount('In Progress')}</div>
                        <div className="stat-card__label">In Progress</div>
                    </div>
                </div>

                <div className="card stat-card" style={{ padding: '20px' }}>
                    <div className="stat-card__icon" style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                        <CheckSquare size={24} />
                    </div>
                    <div>
                        <div className="stat-card__value">{getCount('Completed')}</div>
                        <div className="stat-card__label">Completed</div>
                    </div>
                </div>

                <div className="card stat-card" style={{ padding: '20px' }}>
                    <div className="stat-card__icon" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                        <AlertTriangle size={24} />
                    </div>
                    <div>
                        <div className="stat-card__value">{getCount('Overdue')}</div>
                        <div className="stat-card__label">Overdue</div>
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="table-responsive">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Task</th>
                                <th>Assigned By</th>
                                <th>Due Date</th>
                                <th>Priority</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan="6" className="text-center py-4">Loading tasks...</td></tr>
                            ) : tasks?.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="text-center py-8 text-muted">
                                        You have no tasks assigned.
                                    </td>
                                </tr>
                            ) : (
                                tasks?.map(task => (
                                    <tr key={task.id}>
                                        <td>
                                            <div style={{ fontWeight: '500' }}>{task.title}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{task.description}</div>
                                        </td>
                                        <td>{task.assigned_by_name}</td>
                                        <td>{new Date(task.due_date).toLocaleDateString()}</td>
                                        <td>
                                            <span style={{ 
                                                padding: '2px 8px', borderRadius: '4px', fontSize: '12px',
                                                backgroundColor: task.priority === 'High' || task.priority === 'Urgent' ? 'var(--error)' : 'var(--surface-3)',
                                                color: task.priority === 'High' || task.priority === 'Urgent' ? 'white' : 'var(--text)'
                                            }}>
                                                {task.priority}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{ 
                                                padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold',
                                                backgroundColor: task.status === 'Completed' ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)',
                                                color: task.status === 'Completed' ? '#10b981' : '#3b82f6'
                                            }}>
                                                {task.status}
                                            </span>
                                        </td>
                                        <td>
                                            <button className="btn btn-outline btn-sm">Update</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default MyTasks;
