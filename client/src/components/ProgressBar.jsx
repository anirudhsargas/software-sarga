import React, { useEffect, useState, useRef } from 'react';

/**
 * ProgressBar Component
 * A "fake" progress bar that provides a visual illusion of progress for slow operations.
 * It moves quickly at first, then slows down as it approaches 90%, and jumps to 100% when active becomes false.
 */
const ProgressBar = React.memo(({ active, onComplete }) => {
  const [progress, setProgress] = useState(0);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (active) {
      const intervals = [
        { target: 30, speed: 40 },
        { target: 60, speed: 80 },
        { target: 85, speed: 250 },
        { target: 95, speed: 1000 },
      ];
      let current = 0;
      let currentInterval;
      const startPhase = (index) => {
        if (index >= intervals.length || !activeRef.current) return;
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
    } else if (progress > 0) {
      setProgress(100);
      const timer = setTimeout(() => {
        setProgress(0);
        if (onComplete) onComplete();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [active]);

  if (progress === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '3px',
      zIndex: 'var(--z-toast)',
      background: 'var(--card)',
      pointerEvents: 'none'
    }}>
      <div style={{
        height: '100%',
        width: `${progress}%`,
        background: 'var(--accent)',
        transition: progress === 100 ? 'width 0.3s ease-out' : 'width 0.4s cubic-bezier(0.1, 0, 0.1, 1)',
        boxShadow: '0 0 10px var(--accent), 0 0 5px var(--accent)'
      }} />
    </div>
  );
});

export default ProgressBar;
