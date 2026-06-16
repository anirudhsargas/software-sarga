import React, { useState } from 'react';
import {
    ArrowLeft, Sparkles, RefreshCw, Maximize2, Minimize2,
    Languages, Copy, CheckCircle, FileText
} from 'lucide-react';
import './AIMatterBuilder.css';

const STYLES = ['Traditional', 'Modern', 'Luxury', 'Minimal', 'Kerala Style'];
const LANGUAGES = ['English', 'Malayalam', 'Bilingual'];

const generatedMatters = {
    Traditional: {
        English: `We joyfully invite you to the wedding of our beloved children

Ananya Krishnan
D/o Mr. & Mrs. Krishnan

&

Arun Nair
S/o Mr. & Mrs. Nair

on Sunday, 15th December 2026
at 10:00 AM

Green Valley Convention Centre
Kochi, Kerala

Your presence will be our greatest honour.

With love & blessings,
The Families`,
        Malayalam: 'ഞങ്ങളുടെ പ്രിയപ്പെട്ട മക്കളുടെ വിവാഹത്തിലേക്ക് നിങ്ങളെ ഹൃദയപൂർവ്വം ക്ഷണിക്കുന്നു...',
        Bilingual: 'We joyfully invite you to the wedding of our beloved children...\n\nഞങ്ങളുടെ പ്രിയപ്പെട്ട മക്കളുടെ വിവാഹത്തിലേക്ക് നിങ്ങളെ ഹൃദയപൂർവ്വം ക്ഷണിക്കുന്നു...',
    },
    Modern: { English: 'Together with their families\n\nAnanya & Arun\n\ninvite you to celebrate their wedding\n\n15 December 2026 | 10:00 AM\nGreen Valley Convention Centre, Kochi', Malayalam: '', Bilingual: '' },
    Luxury: { English: 'The privilege of your presence is requested\nat the wedding of\n\nAnanya Krishnan & Arun Nair\n\nFifteen. Twelve. Twenty Twenty-Six\nTen in the morning\nGreen Valley Convention Centre\nKochi', Malayalam: '', Bilingual: '' },
    Minimal: { English: 'Ananya & Arun\n15.12.2026\n10:00 AM\nGreen Valley Convention Centre, Kochi\n\nJoin us in celebration', Malayalam: '', Bilingual: '' },
    'Kerala Style': { English: 'Ananya Krishnan & Arun Nair\n\nWedding: 15 Dec 2026, 10:00 AM\nGreen Valley Convention Centre, Kochi\n\nReception: 16 Dec 2026, 7:00 PM\nAt the same venue\n\nAll are cordially invited', Malayalam: '', Bilingual: '' },
};

const AIMatterBuilder = () => {
    const [style, setStyle] = useState('Traditional');
    const [language, setLanguage] = useState('English');
    const [matter, setMatter] = useState(generatedMatters.Traditional.English);
    const [copied, setCopied] = useState(false);
    const [generating, setGenerating] = useState(false);

    const handleStyleChange = (newStyle) => {
        setStyle(newStyle);
        generateMatter(newStyle, language);
    };

    const handleLanguageChange = (newLang) => {
        setLanguage(newLang);
        generateMatter(style, newLang);
    };

    const generateMatter = (s, lang) => {
        setGenerating(true);
        setTimeout(() => {
            const text = generatedMatters[s]?.[lang] || generatedMatters[s]?.English || 'Invitation matter will appear here...';
            setMatter(text);
            setGenerating(false);
        }, 600);
    };

    const handleRewrite = () => {
        setGenerating(true);
        setTimeout(() => setGenerating(false), 800);
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(matter);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleUseInEditor = () => {
        window.location.href = '/dashboard/design-studio/editor/new';
    };

    return (
        <div className="aim-layout">
            <header className="aim-header">
                <div className="aim-header-left">
                    <button className="dse-tb-btn" onClick={() => window.history.back()}><ArrowLeft size={18} /></button>
                    <div>
                        <h2>AI Matter Builder</h2>
                        <span className="aim-subtitle">Generate wedding invitation text with AI</span>
                    </div>
                </div>
            </header>

            <div className="aim-body">
                <div className="aim-content">
                    <div className="aim-config">
                        <div className="aim-config-group">
                            <h4>Style</h4>
                            <div className="aim-chip-row">
                                {STYLES.map(s => (
                                    <button key={s} className={`aim-chip ${style === s ? 'active' : ''}`} onClick={() => handleStyleChange(s)}>
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="aim-config-group">
                            <h4>Language</h4>
                            <div className="aim-chip-row">
                                {LANGUAGES.map(l => (
                                    <button key={l} className={`aim-chip ${language === l ? 'active' : ''}`} onClick={() => handleLanguageChange(l)}>
                                        <Languages size={14} /> {l}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="aim-editor">
                        <div className="aim-editor-header">
                            <h4><Sparkles size={16} /> Generated Matter</h4>
                            <div className="aim-editor-actions">
                                <button className="dse-tb-btn" onClick={handleRewrite} title="Rewrite">
                                    <RefreshCw size={16} />
                                </button>
                                <button className="dse-tb-btn" title="Expand">
                                    <Maximize2 size={16} />
                                </button>
                                <button className="dse-tb-btn" title="Shorten">
                                    <Minimize2 size={16} />
                                </button>
                                <button className="dse-tb-btn" onClick={handleCopy} title="Copy">
                                    {copied ? <CheckCircle size={16} className="aim-success" /> : <Copy size={16} />}
                                </button>
                            </div>
                        </div>
                        <div className="aim-textarea-wrapper">
                            {generating ? (
                                <div className="aim-generating">
                                    <Sparkles size={24} className="aim-sparkle" />
                                    <p>Generating matter...</p>
                                </div>
                            ) : (
                                <textarea
                                    className="aim-textarea"
                                    value={matter}
                                    onChange={e => setMatter(e.target.value)}
                                    spellCheck
                                />
                            )}
                        </div>
                    </div>

                    <div className="aim-footer">
                        <button className="ds-btn aim-btn-secondary" onClick={handleRewrite}>
                            <RefreshCw size={16} /> Regenerate
                        </button>
                        <button className="ds-btn ds-btn-primary aim-btn-primary" onClick={handleUseInEditor}>
                            <FileText size={16} /> Use in Editor
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AIMatterBuilder;
