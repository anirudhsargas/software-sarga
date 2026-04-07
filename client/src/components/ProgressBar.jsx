import React, { useEffect, useState } from 'react';

/**
 * ProgressBar Component
 * A "fake" progress bar that provides a visual illusion of progress for slow operations.
 * It moves quickly at first, then slows down as it approaches 90%, and jumps to 100% when active becomes false.
 */
const ProgressBar = ({ active, onComplete }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!active) {
      if (progress > 0) {
        // Jump to 100% when operation completes
        setProgress(100);
        const timer = setTimeout(() => {
          setProgress(0);
          if (onComplete) onComplete();
        }, 300);
        return () => clearTimeout(timer);
      }
      return;
    }

    // Progression logic
    const intervals = [
      { target: 30, speed: 40 },   // Fast start: 0-30%
      { target: 60, speed: 80 },   // Medium: 30-60%
      { target: 85, speed: 250 },  // Slowing down: 60-85%
      { target: 95, speed: 1000 }, // Crawling: 85-95%
    ];

    let current = 0;
    let currentInterval;

    const startPhase = (index) => {
      if (index >= intervals.length || !active) return;
      
      const { target, speed } = intervals[index];
      
      currentInterval = setInterval(() => {
        current += 1;
        setProgress(current);
        
        if (current >= target) {
          clearInterval(currentInterval);
          startPhase(index + 1);
        }
      }, speed);
    };

    startPhase(0);

    return () => {
        if (currentInterval) clearInterval(currentInterval);
    };
  }, [active]);

  if (progress === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '3px',
      zIndex: 9999,
      background: 'rgba(255, 255, 255, 0.1)',
      pointerEvents: 'none'
    }}>
      <div style={{
        height: '100%',
        width: `${progress}%`,
        background: 'var(--accent, #3b82f6)',
        transition: progress === 100 ? 'width 0.3s ease-out' : 'width 0.4s cubic-bezier(0.1, 0, 0.1, 1)',
        boxShadow: '0 0 10px var(--accent, #3b82f6), 0 0 5px var(--accent, #3b82f6)'
      }} />
    </div>
  );
};

export default ProgressBar;
