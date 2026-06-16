import React, { useState } from 'react';
import {
    ArrowLeft, Upload, Sparkles, Image, Palette, Type, Layout,
    RefreshCw, Eye, CheckCircle, Loader2, Wand2
} from 'lucide-react';
import './AIDesignGenerator.css';

const AIDesignGenerator = () => {
    const [uploadedImage, setUploadedImage] = useState(null);
    const [preview, setPreview] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [analysis, setAnalysis] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [generated, setGenerated] = useState(false);
    const [trainingEnabled, setTrainingEnabled] = useState(false);

    const handleImageUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadedImage(file);
        const url = URL.createObjectURL(file);
        setPreview(url);
        analyzeImage();
    };

    const analyzeImage = () => {
        setAnalyzing(true);
        setTimeout(() => {
            setAnalysis({
                style: 'Traditional Kerala Wedding',
                colors: ['#8B0000', '#FFD700', '#FFF8DC', '#2F4F2F'],
                fonts: ['Playfair Display', 'DM Serif'],
                layout: 'Centered with decorative border',
                theme: 'Cultural / Traditional',
            });
            setAnalyzing(false);
        }, 1500);
    };

    const handleGenerate = (mode) => {
        setGenerating(true);
        setTimeout(() => {
            setGenerated(true);
            setGenerating(false);
        }, 2000);
    };

    return (
        <div className="aig-layout">
            <header className="aig-header">
                <div className="aig-header-left">
                    <button className="dse-tb-btn" onClick={() => window.history.back()}><ArrowLeft size={18} /></button>
                    <div>
                        <h2>AI Design Generation</h2>
                        <span className="aig-subtitle">Create designs from inspiration images</span>
                    </div>
                </div>
            </header>

            <div className="aig-body">
                <div className="aig-content">
                    {!uploadedImage && (
                        <div className="aig-upload-zone">
                            <div className="aig-upload-icon">
                                <Upload size={48} strokeWidth={1} />
                            </div>
                            <h3>Upload an Invitation Design</h3>
                            <p>Upload a reference image and let AI analyze the style, colors, and layout</p>
                            <label className="ds-btn ds-btn-primary aig-upload-btn">
                                <Upload size={18} /> Choose Image
                                <input type="file" accept="image/*" onChange={handleImageUpload} hidden />
                            </label>
                            <span className="aig-supported">Supports JPG, PNG, WebP</span>
                        </div>
                    )}

                    {preview && (
                        <div className="aig-analysis">
                            <div className="aig-preview-section">
                                <div className="aig-preview">
                                    <img src={preview} alt="Uploaded design" />
                                </div>

                                {analyzing ? (
                                    <div className="aig-analyzing">
                                        <Loader2 size={24} className="aig-spin" />
                                        <p>Analyzing design...</p>
                                    </div>
                                ) : analysis ? (
                                    <div className="aig-analysis-results">
                                        <h4><Wand2 size={16} /> Detected Features</h4>
                                        <div className="aig-analysis-grid">
                                            <div className="aig-analysis-item">
                                                <span className="aig-analysis-label"><Layout size={14} /> Style</span>
                                                <span>{analysis.style}</span>
                                            </div>
                                            <div className="aig-analysis-item">
                                                <span className="aig-analysis-label"><Palette size={14} /> Colors</span>
                                                <div className="aig-colors">
                                                    {analysis.colors.map((c, i) => (
                                                        <span key={i} className="aig-color-swatch" style={{ backgroundColor: c }} title={c} />
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="aig-analysis-item">
                                                <span className="aig-analysis-label"><Type size={14} /> Fonts</span>
                                                <span>{analysis.fonts.join(', ')}</span>
                                            </div>
                                            <div className="aig-analysis-item">
                                                <span className="aig-analysis-label"><Layout size={14} /> Layout</span>
                                                <span>{analysis.layout}</span>
                                            </div>
                                            <div className="aig-analysis-item">
                                                <span className="aig-analysis-label"><Sparkles size={14} /> Theme</span>
                                                <span>{analysis.theme}</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </div>

                            {analysis && !generated && !generating && (
                                <div className="aig-generate-actions">
                                    <h4>Generate Design</h4>
                                    <div className="aig-action-btns">
                                        <button className="aig-action-btn" onClick={() => handleGenerate('similar')}>
                                            <Image size={24} />
                                            <span className="aig-action-label">Generate Similar</span>
                                        </button>
                                        <button className="aig-action-btn" onClick={() => handleGenerate('modern')}>
                                            <Sparkles size={24} />
                                            <span className="aig-action-label">Generate Modern</span>
                                        </button>
                                        <button className="aig-action-btn" onClick={() => handleGenerate('premium')}>
                                            <Sparkles size={24} />
                                            <span className="aig-action-label">Generate Premium</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {generating && (
                                <div className="aig-generating">
                                    <Sparkles size={32} className="aig-sparkle" />
                                    <p>Generating your design...</p>
                                    <div className="isc-progress-bar">
                                        <div className="isc-progress-fill" />
                                    </div>
                                </div>
                            )}

                            {generated && (
                                <div className="aig-done">
                                    <CheckCircle size={48} className="aig-success-icon" />
                                    <h3>Design Generated!</h3>
                                    <p>Your AI-powered design is ready in the editor</p>
                                    <div className="aig-done-actions">
                                        <button className="ds-btn ds-btn-primary" onClick={() => window.location.href = '/dashboard/design-studio/editor/new'}>
                                            <Eye size={16} /> Open in Editor
                                        </button>
                                        <button className="ds-btn" onClick={() => { setPreview(null); setAnalysis(null); setGenerated(false); setUploadedImage(null); }}>
                                            <Upload size={16} /> New Image
                                        </button>
                                    </div>
                                </div>
                            )}

                            {analysis && (
                                <div className="aig-training-toggle">
                                    <label className="ds-toggle">
                                        <input type="checkbox" checked={trainingEnabled} onChange={e => setTrainingEnabled(e.target.checked)} />
                                        <span className="ds-toggle-slider"></span>
                                        <div>
                                            <span>Train From Final Design</span>
                                            <p className="aig-toggle-desc">Store to improve future AI suggestions</p>
                                        </div>
                                    </label>
                                    {trainingEnabled && (
                                        <p className="aig-privacy-note">
                                            Original upload, generated design, and final approved design will be stored.<br />
                                            <strong>Privacy:</strong> Training is disabled by default. Enable only if you wish to contribute.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AIDesignGenerator;
