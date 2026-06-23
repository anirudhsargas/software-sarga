import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Mail, Search, Filter, BookOpen, ExternalLink, Calendar, User, Save, RefreshCw, Plus, Trash2, Edit3, Eye, Share2, EyeOff, Sparkles, Layout } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import './BlogCMS.css';
import PageContainer from '../components/ui/PageContainer';
import { useConfirm } from '../contexts/ConfirmContext';
import { usePageTitle } from '../hooks/usePageTitle';

const CATEGORIES = [
  'Wedding Card Guides',
  'Offset Printing Tips',
  'Digital Printing',
  'Design Advice',
  'Business Branding',
  'Marketing Materials',
  'School & College Printing'
];

const BlogCMS = () => {
  usePageTitle('Blog CMS');
  const { confirm } = useConfirm();
  const postsRef = useRef([]);
  const authorsRef = useRef([]);
  const analyticsRef = useRef(null);
  const [posts, setPosts] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  
  // Analytics
  const [analytics, setAnalytics] = useState(null);

  // Form Modals
  const [showPostModal, setShowPostModal] = useState(false);
  const [showAuthorModal, setShowAuthorModal] = useState(false);
  
  // Current Post Form State
  const [editingPostId, setEditingPostId] = useState(null);
  const [postForm, setPostForm] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    featured_image: '',
    category: CATEGORIES[0],
    tags: '',
    author_id: 1,
    status: 'Draft',
    scheduled_at: '',
    seo_title: '',
    seo_description: ''
  });

  // Current Author Form State
  const [authorForm, setAuthorForm] = useState({
    name: '',
    role: 'Print Specialist',
    bio: '',
    avatar_url: ''
  });

  const [saving, setSaving] = useState(false);
  const [editorTab, setEditorTab] = useState('edit'); // 'edit' | 'preview'
  const [error, setError] = useState(false);

  const setPostsSmart = useCallback((data) => {
    const str = JSON.stringify(data);
    if (str !== JSON.stringify(postsRef.current)) {
      postsRef.current = data;
      setPosts(data);
    }
  }, []);

  const setAuthorsSmart = useCallback((data) => {
    const str = JSON.stringify(data);
    if (str !== JSON.stringify(authorsRef.current)) {
      authorsRef.current = data;
      setAuthors(data);
    }
  }, []);

  const setAnalyticsSmart = useCallback((data) => {
    const str = JSON.stringify(data);
    if (str !== JSON.stringify(analyticsRef.current)) {
      analyticsRef.current = data;
      setAnalytics(data);
    }
  }, []);

  const fetchBlogData = useCallback(async (signal) => {
    setLoading(true);
    setError(false);
    try {
      // Fetch Posts, Authors, Analytics with a 10s timeout via AbortController signal
      const [postsRes, authorsRes, analyticsRes] = await Promise.all([
        api.get('/blog/admin/posts', { signal, timeout: 10000 }),
        api.get('/blog/admin/authors', { signal, timeout: 10000 }),
        api.get('/blog/admin/analytics', { signal, timeout: 10000 })
      ]);
      setPostsSmart(postsRes.data.posts || []);
      setAuthorsSmart(authorsRes.data.authors || []);
      setAnalyticsSmart(analyticsRes.data);
      setError(false);
    } catch (err) {
      if (err.name !== 'CanceledError' && err.code !== 'ERR_CANCELED') {
        console.error('Failed to fetch blog CMS data:', err);
        setError(true);
        toast.error('Could not load blog management data.');
      }
    } finally {
      setLoading(false);
    }
  }, [setPostsSmart, setAuthorsSmart, setAnalyticsSmart]);

  useEffect(() => {
    const controller = new AbortController();
    fetchBlogData(controller.signal);
    return () => controller.abort();
  }, [fetchBlogData]);

  const handleRetry = useCallback(() => {
    const controller = new AbortController();
    fetchBlogData(controller.signal);
  }, [fetchBlogData]);

  // Sync title to slug automatically when creating
  const handleTitleChange = useCallback((val) => {
    setPostForm(prev => {
      const updated = { ...prev, title: val };
      if (!editingPostId) {
        updated.slug = val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)+/g, '');
        updated.seo_title = val;
      }
      return updated;
    });
  }, [editingPostId]);

  const handleEditClick = useCallback((post) => {
    setEditingPostId(post.id);
    // Fetch full post to edit content
    setSaving(true);
    api.get(`/blog/posts/${post.slug}`)
      .then(res => {
        const fullPost = res.data.post;
        setPostForm({
          title: fullPost.title,
          slug: fullPost.slug,
          excerpt: fullPost.excerpt,
          content: fullPost.content,
          featured_image: fullPost.featured_image || '',
          category: fullPost.category,
          tags: fullPost.tags || '',
          author_id: fullPost.author_id || 1,
          status: fullPost.status,
          scheduled_at: fullPost.scheduled_at ? new Date(fullPost.scheduled_at).toISOString().slice(0, 16) : '',
          seo_title: fullPost.seo_title || '',
          seo_description: fullPost.seo_description || ''
        });
        setEditorTab('edit');
        setShowPostModal(true);
      })
      .catch(() => toast.error('Failed to load full post content.'))
      .finally(() => setSaving(false));
  }, []);

  const handleNewPostClick = useCallback(() => {
    setEditingPostId(null);
    setPostForm({
      title: '',
      slug: '',
      excerpt: '',
      content: '',
      featured_image: '',
      category: CATEGORIES[0],
      tags: '',
      author_id: authors[0]?.id || 1,
      status: 'Draft',
      scheduled_at: '',
      seo_title: '',
      seo_description: ''
    });
    setEditorTab('edit');
    setShowPostModal(true);
  }, [authors]);

  const handleSavePost = useCallback(async (e) => {
    e.preventDefault();
    if (!postForm.title || !postForm.slug || !postForm.content || !postForm.excerpt) {
      return toast.error('Please fill in all required post fields.');
    }
    setSaving(true);
    try {
      if (editingPostId) {
        await api.put(`/blog/admin/posts/${editingPostId}`, postForm);
        toast.success('Blog article updated successfully.');
      } else {
        await api.post('/blog/admin/posts', postForm);
        toast.success('Blog article created and saved successfully.');
      }
      setShowPostModal(false);
      fetchBlogData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save blog post.');
    } finally {
      setSaving(false);
    }
  }, [postForm, editingPostId, fetchBlogData]);

  const handleDeletePost = useCallback(async (id, title) => {
    const isConfirmed = await confirm({
      title: 'Delete Article',
      message: `Are you absolutely sure you want to delete the article: "${title}"?`,
      confirmText: 'Delete',
      type: 'danger'
    });
    if (!isConfirmed) return;
    try {
      await api.delete(`/blog/admin/posts/${id}`);
      toast.success('Article deleted successfully.');
      fetchBlogData();
    } catch {
      toast.error('Failed to delete article.');
    }
  }, [fetchBlogData, confirm]);

  const handleSaveAuthor = useCallback(async (e) => {
    e.preventDefault();
    if (!authorForm.name || !authorForm.role) {
      return toast.error('Author Name and Role are required.');
    }
    setSaving(true);
    try {
      await api.post('/blog/admin/authors', authorForm);
      toast.success('Author profile created successfully.');
      setShowAuthorModal(false);
      setAuthorForm({ name: '', role: 'Print Specialist', bio: '', avatar_url: '' });
      fetchBlogData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create author.');
    } finally {
      setSaving(false);
    }
  }, [authorForm, fetchBlogData]);

  const filteredPosts = useMemo(() => posts.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          post.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'All' || post.status === filterStatus;
    return matchesSearch && matchesStatus;
  }), [posts, searchTerm, filterStatus]);

  return (
    <PageContainer>
      <div className="page-header">
        <div className="row gap-md items-center">
          <div className="header-icon-wrapper">
            <BookOpen size={24} className="text-primary" />
          </div>
          <div>
            <h1 className="page-title">Blog Journal CMS</h1>
            <p className="page-subtitle">Manage SEO articles, educational starter guides, and metrics</p>
          </div>
        </div>
        <div className="row gap-sm">
          <button className="btn btn-ghost" onClick={handleRetry} disabled={loading}>
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button className="btn btn-ghost" onClick={() => setShowAuthorModal(true)}>
            <Plus size={18} /> New Author
          </button>
          <button className="btn btn-primary" onClick={handleNewPostClick}>
            <Plus size={18} /> New Article
          </button>
        </div>
      </div>

      {/* Analytics widgets */}
      {loading ? (
        <div className="blog-metrics-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="metric-card card glass">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="skeleton-box" style={{ height: '14px', width: '120px' }}></div>
                <div className="skeleton-box" style={{ height: '28px', width: '60px' }}></div>
              </div>
            </div>
          ))}
        </div>
      ) : analytics ? (
        <div className="blog-metrics-grid">
          <div className="metric-card card glass">
            <div className="metric-header">
              <Eye size={20} className="text-primary" />
              <span>Total Article Views</span>
            </div>
            <h3>{analytics.summary?.totalViews || 0}</h3>
          </div>
          <div className="metric-card card glass">
            <div className="metric-header">
              <Share2 size={20} style={{ color: 'var(--success)' }} />
              <span>Social Shares</span>
            </div>
            <h3>{analytics.summary?.totalShares || 0}</h3>
          </div>
          <div className="metric-card card glass">
            <div className="metric-header">
              <Layout size={20} className="text-muted" />
              <span>Published Articles</span>
            </div>
            <h3>{analytics.summary?.totalPosts || 0}</h3>
          </div>
        </div>
      ) : null}

      {/* CMS Table List */}
      <div className="card glass posts-table-card">
        <div className="table-toolbar">
          <div className="search-box-modern">
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Search by title or category..." 
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
              <option value="Draft">Draft</option>
              <option value="Published">Published</option>
              <option value="Scheduled">Scheduled</option>
            </select>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="modern-table">
            <thead>
              <tr>
                <th>Article Info</th>
                <th>Category</th>
                <th>Status</th>
                <th>Views</th>
                <th>Publish Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div className="skeleton-box" style={{ height: '14px', width: '200px' }}></div>
                        <div className="skeleton-box" style={{ height: '10px', width: '120px' }}></div>
                      </div>
                    </td>
                    <td><div className="skeleton-box" style={{ height: '18px', width: '100px', borderRadius: '12px' }}></div></td>
                    <td><div className="skeleton-box" style={{ height: '18px', width: '80px', borderRadius: '12px' }}></div></td>
                    <td><div className="skeleton-box" style={{ height: '14px', width: '40px' }}></div></td>
                    <td><div className="skeleton-box" style={{ height: '14px', width: '80px' }}></div></td>
                    <td><div className="skeleton-box" style={{ height: '28px', width: '80px' }}></div></td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan="6" className="text-center py-24">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                      <span className="text-danger" style={{ fontWeight: 600 }}>Failed to load: /blog/admin/posts</span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={handleRetry} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <RefreshCw size={14} /> Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredPosts.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-24">
                    <div className="empty-state-global">
                      <p className="empty-state-global__title">No articles found</p>
                      <p className="empty-state-global__message">Get started by creating your first article.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPosts.map(post => (
                  <tr key={post.id}>
                    <td className="post-cell">
                      <div className="post-title-main">{post.title}</div>
                      <small className="post-slug-sub">/{post.slug}</small>
                    </td>
                    <td><span className="category-tag">{post.category}</span></td>
                    <td>
                      <span className={`status-badge status-badge--${post.status.toLowerCase()}`}>
                        {post.status}
                      </span>
                    </td>
                    <td>
                      <div className="row gap-xs items-center">
                        <Eye size={14} className="text-muted" />
                        <span>{post.views}</span>
                      </div>
                    </td>
                    <td>{new Date(post.created_at).toLocaleDateString('en-IN')}</td>
                    <td>
                      <div className="row gap-sm">
                        <button className="btn btn-ghost btn-sm" onClick={() => handleEditClick(post)} title="Edit">
                          <Edit3 size={16} />
                        </button>
                        <button className="btn btn-ghost btn-sm text-danger" onClick={() => handleDeletePost(post.id, post.title)} title="Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE / EDIT POST MODAL */}
      {showPostModal && (
        <div className="modal-backdrop">
          <div className="modal modal--blog card glass">
            <div className="modal-header">
              <h2>{editingPostId ? 'Edit Blog Article' : 'Create SEO Article'}</h2>
              <button className="btn-close" onClick={() => setShowPostModal(false)}>✕</button>
            </div>
            
            <form onSubmit={handleSavePost} className="post-modal-form">
              <div className="form-main-columns">
                <div className="form-column-left">
                  <div className="form-group">
                    <label>Article Title *</label>
                    <input 
                      type="text" 
                      className="input" 
                      placeholder="e.g. How to Choose the Perfect GSM for Wedding Cards"
                      value={postForm.title}
                      onChange={(e) => handleTitleChange(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>URL Slug *</label>
                      <input 
                        type="text" 
                        className="input" 
                        value={postForm.slug}
                        onChange={(e) => setPostForm(prev => ({ ...prev, slug: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Category *</label>
                      <select 
                        className="input"
                        value={postForm.category}
                        onChange={(e) => setPostForm(prev => ({ ...prev, category: e.target.value }))}
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Short Excerpt * (Brief summary for listing view)</label>
                    <textarea 
                      className="input excerpt-textarea" 
                      rows={2}
                      placeholder="Write a highly engaging meta excerpt..."
                      value={postForm.excerpt}
                      onChange={(e) => setPostForm(prev => ({ ...prev, excerpt: e.target.value }))}
                      required
                    ></textarea>
                  </div>

                  {/* HTML Rich Text Editor Area */}
                  <div className="form-group editor-group">
                    <div className="editor-header">
                      <label>Article Body Content *</label>
                      <div className="row gap-xs">
                        <button 
                          type="button" 
                          className={`btn btn-sm ${editorTab === 'edit' ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => setEditorTab('edit')}
                        >
                          Write
                        </button>
                        <button 
                          type="button" 
                          className={`btn btn-sm ${editorTab === 'preview' ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => setEditorTab('preview')}
                        >
                          Preview
                        </button>
                      </div>
                    </div>

                    {editorTab === 'edit' ? (
                      <textarea 
                        className="input content-textarea" 
                        rows={12}
                        placeholder="Write article in HTML format. Support standard tags like <p>, <h2>, <ul>, <li>..."
                        value={postForm.content}
                        onChange={(e) => setPostForm(prev => ({ ...prev, content: e.target.value }))}
                        required
                      ></textarea>
                    ) : (
                      <div 
                        className="editor-preview-pane"
                        dangerouslySetInnerHTML={{ __html: postForm.content || '<em>Write some HTML to preview content...</em>' }}
                      />
                    )}
                  </div>
                </div>

                <div className="form-column-right">
                  <h3>Publish Settings</h3>
                  
                  <div className="form-group">
                    <label>Author Profile</label>
                    <select 
                      className="input"
                      value={postForm.author_id}
                      onChange={(e) => setPostForm(prev => ({ ...prev, author_id: Number(e.target.value) }))}
                    >
                      {authors.map(a => <option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Publish Status</label>
                    <select 
                      className="input"
                      value={postForm.status}
                      onChange={(e) => setPostForm(prev => ({ ...prev, status: e.target.value }))}
                    >
                      <option value="Draft">Draft Mode</option>
                      <option value="Published">Publish Immediately</option>
                      <option value="Scheduled">Scheduled Publishing</option>
                    </select>
                  </div>

                  {postForm.status === 'Scheduled' && (
                    <div className="form-group">
                      <label>Schedule Publication Date</label>
                      <input 
                        type="datetime-local" 
                        className="input"
                        value={postForm.scheduled_at}
                        onChange={(e) => setPostForm(prev => ({ ...prev, scheduled_at: e.target.value }))}
                        required
                      />
                    </div>
                  )}

                  <div className="form-group">
                    <label>Featured Image URL</label>
                    <input 
                      type="text" 
                      className="input"
                      placeholder="e.g. /uploads/image.jpg or CDN link"
                      value={postForm.featured_image}
                      onChange={(e) => setPostForm(prev => ({ ...prev, featured_image: e.target.value }))}
                    />
                  </div>

                  <div className="form-group">
                    <label>Tags (Comma separated)</label>
                    <input 
                      type="text" 
                      className="input"
                      placeholder="e.g. GSM, Wedding Cards, Finishes"
                      value={postForm.tags}
                      onChange={(e) => setPostForm(prev => ({ ...prev, tags: e.target.value }))}
                    />
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: 'var(--space-md) 0' }} />

                  <h3>SEO Settings</h3>

                  <div className="form-group">
                    <label>Google SEO Title</label>
                    <input 
                      type="text" 
                      className="input"
                      value={postForm.seo_title}
                      onChange={(e) => setPostForm(prev => ({ ...prev, seo_title: e.target.value }))}
                    />
                  </div>

                  <div className="form-group">
                    <label>Google SEO Description</label>
                    <textarea 
                      className="input"
                      rows={3}
                      value={postForm.seo_description}
                      onChange={(e) => setPostForm(prev => ({ ...prev, seo_description: e.target.value }))}
                    ></textarea>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowPostModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Article'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE AUTHOR MODAL */}
      {showAuthorModal && (
        <div className="modal-backdrop modal-backdrop--high">
          <div className="modal modal--billing card glass">
            <div className="modal-header">
              <h2>Add Author Profile</h2>
              <button className="btn-close" onClick={() => setShowAuthorModal(false)}>✕</button>
            </div>
            
            <form onSubmit={handleSaveAuthor} className="author-modal-form row gap-md" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="form-group">
                <label>Author Name *</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="e.g. Anil Kumar"
                  value={authorForm.name}
                  onChange={(e) => setAuthorForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>

              <div className="form-group">
                <label>Author Designation/Role *</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="e.g. Master Printer"
                  value={authorForm.role}
                  onChange={(e) => setAuthorForm(prev => ({ ...prev, role: e.target.value }))}
                  required
                />
              </div>

              <div className="form-group">
                <label>Bio Details</label>
                <textarea 
                  className="input" 
                  rows={3}
                  placeholder="Tell customers about their printing expertise..."
                  value={authorForm.bio}
                  onChange={(e) => setAuthorForm(prev => ({ ...prev, bio: e.target.value }))}
                ></textarea>
              </div>

              <div className="modal-footer" style={{ border: 'none', padding: 0, marginTop: 'var(--space-md)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowAuthorModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Create Author'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default React.memo(BlogCMS);
