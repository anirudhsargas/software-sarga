import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Search, Plus, Clock, Grid, Upload, FileText, Image, BookOpen,
    CreditCard, Award, Layout, Frame, FolderOpen, MoreHorizontal,
    Edit3, Copy, Archive, Trash2, Star, Eye, ChevronRight, Sparkles,
    PanelRight, Layers, Type
} from 'lucide-react';
import CreateDesignModal from './CreateDesignModal';
import './DesignStudioHome.css';

const categories = [
    { id: 'wedding', name: 'Wedding Cards', icon: Heart, templates: 248, dims: '5×7 in', color: '#e87979', gradient: 'linear-gradient(135deg, #fce4ec, #f8bbd0)' },
    { id: 'visiting', name: 'Visiting Cards', icon: CreditCard, templates: 186, dims: '3.5×2 in', color: '#4fc3f7', gradient: 'linear-gradient(135deg, #e1f5fe, #b3e5fc)' },
    { id: 'album', name: 'Albums', icon: BookOpen, templates: 312, dims: '12×18 in', color: '#81c784', gradient: 'linear-gradient(135deg, #e8f5e9, #c8e6c9)' },
    { id: 'invitation', name: 'Invitations', icon: Mail, templates: 195, dims: '6×8 in', color: '#ffb74d', gradient: 'linear-gradient(135deg, #fff3e0, #ffe0b2)' },
    { id: 'flex', name: 'Flex', icon: Layout, templates: 89, dims: 'Custom', color: '#ba68c8', gradient: 'linear-gradient(135deg, #f3e5f5, #e1bee7)' },
    { id: 'poster', name: 'Posters', icon: Image, templates: 124, dims: 'A3 / A4', color: '#4db6ac', gradient: 'linear-gradient(135deg, #e0f2f1, #b2dfdb)' },
    { id: 'frame', name: 'Photo Frames', icon: Frame, templates: 76, dims: '8×10 in', color: '#ff8a65', gradient: 'linear-gradient(135deg, #fbe9e7, #ffccbc)' },
    { id: 'certificate', name: 'Certificates', icon: Award, templates: 53, dims: 'A4', color: '#90a4ae', gradient: 'linear-gradient(135deg, #eceff1, #cfd8dc)' },
    { id: 'custom', name: 'Custom Size', icon: Grid, templates: 0, dims: 'Any', color: '#f06292', gradient: 'linear-gradient(135deg, #fce4ec, #f48fb1)' },
];

const recentProjectsData = [
    { id: 1, name: 'Anand & Priya Wedding', category: 'Wedding Card', thumbnail: null, lastEdited: '2 hours ago', pages: 2 },
    { id: 2, name: 'Sreejith Album - Vol 2', category: 'Album', thumbnail: null, lastEdited: 'Yesterday', pages: 24 },
    { id: 3, name: 'Dr. Nair Visiting Card', category: 'Visiting Card', thumbnail: null, lastEdited: '3 days ago', pages: 1 },
    { id: 4, name: 'Grand Opening Banner', category: 'Flex', thumbnail: null, lastEdited: '1 week ago', pages: 1 },
];

function Heart(props) { return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
); }
function Mail(props) { return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
); }

const DesignStudioHome = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [search, setSearch] = useState('');
    const [showCreate, setShowCreate] = useState(searchParams.get('create') === 'true');
    const [activeSection, setActiveSection] = useState('all');
    const [recentProjects, setRecentProjects] = useState(recentProjectsData);
    const [contextMenu, setContextMenu] = useState(null);

    const filteredCategories = useMemo(() => {
        if (!search) return categories;
        const q = search.toLowerCase();
        return categories.filter(c => c.name.toLowerCase().includes(q));
    }, [search]);

    const sections = ['all', ...categories.map(c => c.id)];

    const handleContinueDesign = (categoryId) => {
        const category = categories.find(c => c.id === categoryId);
        if (!category) return;
        setShowCreate(true);
    };

    const handleOpenEditor = (id) => {
        navigate(`/dashboard/design-studio/editor/${id}`);
    };

    const handleNewDesign = () => setShowCreate(true);

    const handleCreateProject = (values) => {
        setShowCreate(false);
        navigate(`/dashboard/design-studio/editor/new`, { state: values });
    };

    const handleDuplicateProject = (id) => {
        const project = recentProjects.find(p => p.id === id);
        if (project) {
            const newProject = { ...project, id: Date.now(), name: `${project.name} (Copy)`, lastEdited: 'Just now' };
            setRecentProjects(prev => [newProject, ...prev]);
        }
        setContextMenu(null);
    };

    const handleArchiveProject = (id) => {
        setRecentProjects(prev => prev.filter(p => p.id !== id));
        setContextMenu(null);
    };

    const handleDeleteProject = (id) => {
        setRecentProjects(prev => prev.filter(p => p.id !== id));
        setContextMenu(null);
    };

    return (
        <div className="ds-home">
            <header className="ds-header">
                <div className="ds-header-top">
                    <div>
                        <h1 className="ds-title">Design Studio</h1>
                        <p className="ds-subtitle">Create stunning print-ready designs in minutes</p>
                    </div>
                    <div className="ds-header-actions">
                        <div className="ds-search">
                            <Search size={18} />
                            <input
                                type="text"
                                placeholder="Search categories, templates..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <button className="ds-btn ds-btn-primary" onClick={handleNewDesign}>
                            <Plus size={18} /> New Design
                        </button>
                        <button className="ds-btn ds-btn-ghost">
                            <Upload size={18} /> Upload
                        </button>
                        <button className="ds-btn ds-btn-ghost">
                            <FolderOpen size={18} /> Drafts
                        </button>
                    </div>
                </div>
            </header>

            <div className="ds-section-nav">
                {sections.map(s => (
                    <button
                        key={s}
                        className={`ds-section-tab ${activeSection === s ? 'active' : ''}`}
                        onClick={() => setActiveSection(s)}
                    >
                        {s === 'all' ? 'All Categories' : categories.find(c => c.id === s)?.name || s}
                    </button>
                ))}
            </div>

            <section className="ds-categories">
                <div className="ds-categories-grid">
                    {(activeSection === 'all' ? filteredCategories : filteredCategories.filter(c => c.id === activeSection)).map(cat => (
                        <div key={cat.id} className="ds-category-card" style={{ '--card-gradient': cat.gradient, '--card-color': cat.color }}>
                            <div className="ds-category-thumb">
                                <cat.icon size={40} strokeWidth={1.5} />
                            </div>
                            <div className="ds-category-info">
                                <h3>{cat.name}</h3>
                                <div className="ds-category-meta">
                                    <span>{cat.templates} templates</span>
                                    <span className="ds-dot">·</span>
                                    <span>{cat.dims}</span>
                                </div>
                            </div>
                            <button className="ds-btn ds-btn-card" onClick={() => handleContinueDesign(cat.id)}>
                                Continue Design <ChevronRight size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            <section className="ds-recent">
                <div className="ds-section-header">
                    <h2><Clock size={20} /> Recent Projects</h2>
                    {recentProjects.length > 0 && (
                        <button className="ds-btn ds-btn-text" onClick={() => setRecentProjects([])}>Clear All</button>
                    )}
                </div>
                {recentProjects.length === 0 ? (
                    <div className="ds-empty">
                        <FileText size={48} strokeWidth={1} />
                        <p>No recent projects. Start a new design!</p>
                    </div>
                ) : (
                    <div className="ds-recent-grid">
                        {recentProjects.map(project => (
                            <div key={project.id} className="ds-project-card" onClick={() => handleOpenEditor(project.id)}>
                                <div className="ds-project-thumb">
                                    {project.thumbnail ? (
                                        <img src={project.thumbnail} alt={project.name} />
                                    ) : (
                                        <div className="ds-project-placeholder">
                                            <Image size={32} strokeWidth={1} />
                                        </div>
                                    )}
                                    <span className="ds-project-pages">{project.pages} {project.pages === 1 ? 'page' : 'pages'}</span>
                                </div>
                                <div className="ds-project-body">
                                    <div className="ds-project-info">
                                        <span className="ds-project-category">{project.category}</span>
                                        <h4>{project.name}</h4>
                                        <span className="ds-project-time">Edited {project.lastEdited}</span>
                                    </div>
                                    <div className="ds-project-actions">
                                        <button className="ds-btn-icon" title="Continue Editing" onClick={e => { e.stopPropagation(); handleOpenEditor(project.id); }}>
                                            <Edit3 size={16} />
                                        </button>
                                        <div className="ds-btn-group">
                                            <button className="ds-btn-icon" title="More" onClick={e => { e.stopPropagation(); setContextMenu(contextMenu === project.id ? null : project.id); }}>
                                                <MoreHorizontal size={16} />
                                            </button>
                                            {contextMenu === project.id && (
                                                <div className="ds-context-menu">
                                                    <button onClick={e => { e.stopPropagation(); handleDuplicateProject(project.id); }}>
                                                        <Copy size={14} /> Duplicate
                                                    </button>
                                                    <button onClick={e => { e.stopPropagation(); setContextMenu(null); }}>
                                                        <Star size={14} /> Favorite
                                                    </button>
                                                    <button onClick={e => { e.stopPropagation(); handleArchiveProject(project.id); }}>
                                                        <Archive size={14} /> Archive
                                                    </button>
                                                    <button className="danger" onClick={e => { e.stopPropagation(); handleDeleteProject(project.id); }}>
                                                        <Trash2 size={14} /> Delete
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {showCreate && (
                <CreateDesignModal
                    onClose={() => setShowCreate(false)}
                    onCreate={handleCreateProject}
                />
            )}
        </div>
    );
};

export default DesignStudioHome;
