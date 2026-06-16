import React, { useState } from 'react';
import {
    ArrowLeft, Camera, Upload, FileText, ScanLine, Sparkles,
    CheckCircle, AlertCircle, Edit3, RefreshCw
} from 'lucide-react';
import './InvitationScanner.css';

const InvitationScanner = () => {
    const [step, setStep] = useState('input');
    const [scanning, setScanning] = useState(false);
    const [result, setResult] = useState(null);

    const mockFields = [
        { label: 'Bride Name', value: 'Ananya Krishnan', confidence: 98 },
        { label: 'Groom Name', value: 'Arun Nair', confidence: 96 },
        { label: 'Parents', value: 'Mr. & Mrs. Krishnan & Nair', confidence: 92 },
        { label: 'Date', value: '15 December 2026', confidence: 99 },
        { label: 'Time', value: '10:00 AM onwards', confidence: 94 },
        { label: 'Venue', value: 'Green Valley Convention Centre, Kochi', confidence: 89 },
        { label: 'RSVP', value: '+91 9876543210', confidence: 85 },
    ];

    const handleScan = () => {
        setScanning(true);
        setTimeout(() => {
            setScanning(false);
            setResult(mockFields);
            setStep('result');
        }, 2000);
    };

    const handleGenerateDesign = () => {
        setStep('generating');
        setTimeout(() => setStep('done'), 1500);
    };

    return (
        <div className="isc-layout">
            <header className="isc-header">
                <div className="isc-header-left">
                    <button className="dse-tb-btn" onClick={() => window.history.back()}><ArrowLeft size={18} /></button>
                    <div>
                        <h2>Invitation Matter Scanner</h2>
                        <span className="isc-subtitle">OCR-powered invitation text extraction</span>
                    </div>
                </div>
            </header>

            <div className="isc-body">
                {step === 'input' && (
                    <div className="isc-content">
                        <div className="isc-hero">
                            <ScanLine size={48} strokeWidth={1} />
                            <h3>Scan Invitation Matter</h3>
                            <p>Upload an invitation image or PDF to extract text and auto-generate a design</p>
                        </div>

                        <div className="isc-options">
                            <button className="isc-option" onClick={handleScan}>
                                <div className="isc-option-icon"><Camera size={28} /></div>
                                <div className="isc-option-info">
                                    <h4>Camera</h4>
                                    <p>Capture invitation using your camera</p>
                                </div>
                            </button>
                            <button className="isc-option" onClick={handleScan}>
                                <div className="isc-option-icon"><Upload size={28} /></div>
                                <div className="isc-option-info">
                                    <h4>Upload Image</h4>
                                    <p>JPG, PNG, or WebP</p>
                                </div>
                            </button>
                            <button className="isc-option" onClick={handleScan}>
                                <div className="isc-option-icon"><FileText size={28} /></div>
                                <div className="isc-option-info">
                                    <h4>Upload PDF</h4>
                                    <p>Multi-page PDF documents</p>
                                </div>
                            </button>
                        </div>

                        {scanning && (
                            <div className="isc-scanning">
                                <div className="isc-scan-anim">
                                    <ScanLine size={32} className="isc-scan-icon" />
                                </div>
                                <p>Scanning invitation content...</p>
                                <div className="isc-progress-bar">
                                    <div className="isc-progress-fill" />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {step === 'result' && result && (
                    <div className="isc-content">
                        <div className="isc-result-header">
                            <CheckCircle size={24} className="isc-success-icon" />
                            <h3>Text Extracted Successfully</h3>
                            <p>Review and edit the extracted fields below</p>
                        </div>

                        <div className="isc-fields">
                            {result.map((field, i) => (
                                <div key={i} className="isc-field">
                                    <div className="isc-field-header">
                                        <span className="isc-field-label">{field.label}</span>
                                        <span className={`isc-field-confidence ${field.confidence >= 90 ? 'high' : field.confidence >= 75 ? 'medium' : 'low'}`}>
                                            <AlertCircle size={12} /> {field.confidence}%
                                        </span>
                                    </div>
                                    <div className="isc-field-value">
                                        <input defaultValue={field.value} />
                                        <button className="dse-tb-btn"><Edit3 size={14} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="isc-actions">
                            <button className="ds-btn" onClick={() => { setStep('input'); setResult(null); }}>
                                <RefreshCw size={16} /> Rescan
                            </button>
                            <button className="ds-btn ds-btn-primary" onClick={handleGenerateDesign}>
                                <Sparkles size={16} /> Generate Design
                            </button>
                        </div>
                    </div>
                )}

                {step === 'generating' && (
                    <div className="isc-content">
                        <div className="isc-scanning">
                            <div className="isc-scan-anim">
                                <Sparkles size={32} className="isc-scan-icon" />
                            </div>
                            <p>Generating invitation design...</p>
                            <div className="isc-progress-bar">
                                <div className="isc-progress-fill" style={{ width: '70%' }} />
                            </div>
                        </div>
                    </div>
                )}

                {step === 'done' && (
                    <div className="isc-content">
                        <div className="isc-result-header">
                            <CheckCircle size={48} className="isc-success-icon" />
                            <h3>Design Generated!</h3>
                            <p>Your invitation design is ready in the editor</p>
                        </div>
                        <div className="isc-actions" style={{ justifyContent: 'center' }}>
                            <button className="ds-btn ds-btn-primary" onClick={() => window.location.href = '/dashboard/design-studio/editor/new'}>
                                Open in Editor
                            </button>
                            <button className="ds-btn">Start New Scan</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InvitationScanner;
