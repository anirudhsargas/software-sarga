import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react';

const steps = [
  { title: 'Step 1: Choose a Template', content: 'Start by selecting a professional template or build from scratch.', target: '.pe-toolbar' },
  { title: 'Step 2: Customize Design', content: 'Use the left panel to add text, shapes, and images. Smart guides will help you align objects perfectly.', target: '.pe-left' },
  { title: 'Step 3: Preview & Order', content: 'Once you are happy with the design, hit export or save to proceed to checkout.', target: '.pe-btn--primary' }
];

export default function EditorOnboarding() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('sarga_editor_tour');
    if (!hasSeenTour) {
      setTimeout(() => setIsVisible(true), 1000);
    }
  }, []);

  const completeTour = () => {
    setIsVisible(false);
    localStorage.setItem('sarga_editor_tour', 'true');
  };

  if (!isVisible) return null;

  return (
    <div className="editor-onboarding-overlay" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div className="onboarding-card glass-card slide-up" style={{
        background: 'var(--surface)', padding: 'var(--space-xl)', borderRadius: 'var(--radius-xl)',
        maxWidth: '400px', width: '90%', position: 'relative', boxShadow: 'var(--shadow-modal)'
      }}>
        <button onClick={completeTour} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer' }}>
          <X size={20} color="var(--text-muted)" />
        </button>
        
        <h3 className="text-h5" style={{ marginBottom: 'var(--space-sm)' }}>{steps[currentStep].title}</h3>
        <p className="text-body text-secondary" style={{ marginBottom: 'var(--space-lg)' }}>{steps[currentStep].content}</p>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="step-dots" style={{ display: 'flex', gap: '6px' }}>
            {steps.map((_, i) => (
              <span key={i} style={{
                width: 8, height: 8, borderRadius: '50%',
                background: i === currentStep ? 'var(--brand-accent)' : 'var(--border)'
              }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {currentStep > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setCurrentStep(prev => prev - 1)}>
                <ChevronLeft size={16} /> Back
              </button>
            )}
            {currentStep < steps.length - 1 ? (
              <button className="btn btn-primary btn-sm" onClick={() => setCurrentStep(prev => prev + 1)}>
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={completeTour}>
                Got it <Check size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
