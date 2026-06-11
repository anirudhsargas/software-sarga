import React, { useState, useEffect } from 'react';
import { Mail, MessageCircle, Phone, Search, Filter, MessageSquare, ExternalLink, Calendar, User, Save, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import usePolling from '../hooks/usePolling';
import '../styles/WebInquiries.css';

const WebInquiries = () => {
    const [inquiries, setInquiries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedInquiry, setSelectedInquiry] = useState(null);
    const [updating, setUpdating] = useState(false);
    const [noteDraft, setNoteDraft] = useState('');

    const fetchInquiries = async () => {
        try {
            const { data } = await api.get(`/website-inquiries?status=${filterStatus}`);
            setInquiries(data.data || []);
        } catch (error) {
            console.error('Failed to fetch inquiries:', error);
            toast.error('Could not load website inquiries');
        } finally {
            setLoading(false);
        }
    };

    // Auto-refresh every 60 seconds
    usePolling(fetchInquiries, 60000);

    useEffect(() => {
        setLoading(true);
        fetchInquiries();
    }, [filterStatus]);

    const handleStatusUpdate = async (id, newStatus, internalNotes) => {
        setUpdating(true);
        try {
            await api.patch(`/website-inquiries/${id}/status`, { 
                status: newStatus,
                internal_notes: internalNotes
            });
            toast.success(`Inquiry marked as ${newStatus}`);
            fetchInquiries();
            
            if (selectedInquiry?.id === id) {
                setSelectedInquiry(prev => ({ ...prev, status: newStatus, internal_notes: internalNotes }));
            }
        } catch (error) {
            toast.error('Failed to update inquiry status');
        } finally {
            setUpdating(false);
        }
    };

    const handleWhatsApp = (phone) => {
        if (!phone) return toast.error("No phone number provided");
        // Simple clean for India format if missing
        let cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
        window.open(`https://wa.me/${cleanPhone}`, '_blank');
    };

    const handleEmail = (email, subject) => {
        if (!email) return toast.error("No email provided");
        window.open(`mailto:${email}?subject=Re: Your Inquiry with SARGA Offset`, '_blank');
    };

    const filteredInquiries = inquiries.filter(iq => 
        (iq.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
         iq.phone?.includes(searchTerm) ||
         iq.email?.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const getStatusClass = (status) => {
        switch(status) {
            case 'New': return 'status-badge--new';
            case 'Contacted': return 'status-badge--contacted';
            case 'Closed': return 'status-badge--closed';
            default: return '';
        }
    };

    return (
        <div className="web-inquiries-container">
            <div className="page-header">
                <div className="row gap-md items-center">
                    <div className="header-icon-wrapper">
                        <MessageSquare size={24} className="text-primary" />
                    </div>
                    <div>
                        <h1 className="page-title">Website Inquiries</h1>
                        <p className="page-subtitle">Manage customer messages from the public website</p>
                    </div>
                </div>
                <button className="btn btn-ghost" onClick={() => { setLoading(true); fetchInquiries(); }}>
                    <RefreshCw size={18} className={loading ? "spin" : ""} /> Refresh
                </button>
            </div>

            <div className="inquiries-layout">
                {/* List View */}
                <div className="inquiries-list-pane card glass">
                    <div className="inquiries-toolbar">
                        <div className="search-box-modern">
                            <Search size={18} />
                            <input 
                                type="text" 
                                placeholder="Search by name, email or phone..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="filter-group">
                            <Filter size={18} className="text-muted" />
                            <select 
                                value={filterStatus} 
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="status-select"
                            >
                                <option value="All">All Statuses</option>
                                <option value="New">New</option>
                                <option value="Contacted">Contacted</option>
                                <option value="Closed">Closed</option>
                            </select>
                        </div>
                    </div>

                    <div className="inquiries-list">
                        {loading && inquiries.length === 0 ? (
                            <div className="empty-state">Loading inquiries...</div>
                        ) : filteredInquiries.length === 0 ? (
                            <div className="empty-state">No inquiries found.</div>
                        ) : (
                            filteredInquiries.map(iq => (
                                <div 
                                    key={iq.id} 
                                    className={`inquiry-card ${selectedInquiry?.id === iq.id ? 'selected' : ''} ${iq.status === 'New' ? 'unread' : ''}`}
                                    onClick={() => {
                                        setSelectedInquiry(iq);
                                        setNoteDraft(iq.internal_notes || '');
                                    }}
                                >
                                    <div className="inquiry-card-header">
                                        <h3 className="inquiry-name">{iq.name}</h3>
                                        <span className={`status-badge ${getStatusClass(iq.status)}`}>{iq.status}</span>
                                    </div>
                                    <div className="inquiry-meta">
                                        {iq.service && <span className="inquiry-service">{iq.service}</span>}
                                        <span className="inquiry-date">
                                            {new Date(iq.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                                        </span>
                                    </div>
                                    <p className="inquiry-snippet">{iq.message}</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Detail View */}
                <div className="inquiry-detail-pane">
                    {selectedInquiry ? (
                        <div className="card glass detail-card">
                            <div className="detail-header">
                                <h2>{selectedInquiry.name}</h2>
                                <span className={`status-badge ${getStatusClass(selectedInquiry.status)}`}>
                                    {selectedInquiry.status}
                                </span>
                            </div>

                            <div className="detail-scrollable">
                                <div className="detail-contact-grid">
                                    {selectedInquiry.phone && (
                                        <div className="contact-item">
                                            <Phone size={16} />
                                            <span>{selectedInquiry.phone}</span>
                                        </div>
                                    )}
                                    {selectedInquiry.email && (
                                        <div className="contact-item">
                                            <Mail size={16} />
                                            <span>{selectedInquiry.email}</span>
                                        </div>
                                    )}
                                    {selectedInquiry.service && (
                                        <div className="contact-item">
                                            <ExternalLink size={16} />
                                            <span>Interested in: <strong>{selectedInquiry.service}</strong></span>
                                        </div>
                                    )}
                                    <div className="contact-item">
                                        <Calendar size={16} />
                                        <span>{new Date(selectedInquiry.created_at).toLocaleString('en-IN')}</span>
                                    </div>
                                    {selectedInquiry.branch && selectedInquiry.branch !== 'General' && (
                                        <div className="contact-item">
                                            <User size={16} />
                                            <span>Branch: {selectedInquiry.branch}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="detail-message-box">
                                    <h4>Message from Customer:</h4>
                                    <div className="message-content">
                                        {selectedInquiry.message || "No message provided."}
                                    </div>
                                </div>

                                <div className="detail-actions">
                                    <h4>Quick Reply</h4>
                                    <div className="row gap-md">
                                        <button 
                                            className="btn btn-outline btn--whatsapp" 
                                            onClick={() => handleWhatsApp(selectedInquiry.phone)}
                                            disabled={!selectedInquiry.phone}
                                        >
                                            <MessageCircle size={18} className="mr-8" /> WhatsApp
                                        </button>
                                        <button 
                                            className="btn btn-outline btn--email" 
                                            onClick={() => handleEmail(selectedInquiry.email, selectedInquiry.service)}
                                            disabled={!selectedInquiry.email}
                                        >
                                            <Mail size={18} className="mr-8" /> Email
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="detail-notes-section">
                                <h4>Internal Notes & Status</h4>
                                <textarea 
                                    className="notes-textarea" 
                                    placeholder="Add notes about your follow-up here..."
                                    value={noteDraft}
                                    onChange={(e) => setNoteDraft(e.target.value)}
                                ></textarea>
                                <div className="status-actions">
                                    <button 
                                        className="btn btn-primary"
                                        disabled={updating}
                                        onClick={() => handleStatusUpdate(selectedInquiry.id, 'Contacted', noteDraft)}
                                    >
                                        {updating ? 'Saving...' : 'Mark as Contacted'}
                                    </button>
                                    <button 
                                        className="btn btn-ghost text-muted"
                                        disabled={updating}
                                        onClick={() => handleStatusUpdate(selectedInquiry.id, 'Closed', noteDraft)}
                                    >
                                        Mark as Closed
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="detail-empty-state">
                            <MessageSquare size={48} className="text-muted mb-16" />
                            <h3>No Inquiry Selected</h3>
                            <p className="text-muted">Select an inquiry from the list to view details and reply.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WebInquiries;
