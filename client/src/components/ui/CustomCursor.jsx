import React, { useEffect, useRef, useState } from 'react';

export default function CustomCursor() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const rafRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [hoverState, setHoverState] = useState({ overInteractive: false, overTilt: false });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth <= 768) return; // don't render on mobile
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    document.body.style.cursor = 'none';

    let mx = 0, my = 0, rx = 0, ry = 0;

    function onMove(e) {
      mx = e.clientX;
      my = e.clientY;
      dot.style.transform = `translate3d(${mx - 5}px, ${my - 5}px, 0)`; // 10px dot
    }

    function animate() {
      // ring lerp
      rx += (mx - rx) * 0.12;
      ry += (my - ry) * 0.12;
      ring.style.transform = `translate3d(${rx - 18}px, ${ry - 18}px, 0)`;
      rafRef.current = requestAnimationFrame(animate);
    }

    function onOver(e) {
      const t = e.target.closest('a,button');
      const tilt = e.target.closest('.tilt-card');
      setHoverState({ overInteractive: !!t, overTilt: !!tilt });
    }

    function onOut() {
      setHoverState({ overInteractive: false, overTilt: false });
    }

    function onEnter() { setVisible(true); }
    function onLeaveWindow() { setVisible(false); }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    document.addEventListener('mouseenter', onEnter);
    document.addEventListener('mouseleave', onLeaveWindow);

    animate();

    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('mouseenter', onEnter);
      document.removeEventListener('mouseleave', onLeaveWindow);
      document.body.style.cursor = '';
    };
  }, []);

  const dotStyle = {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#c8a97e',
    position: 'fixed',
    top: 0,
    left: 0,
    pointerEvents: 'none',
    zIndex: 9999,
    transform: 'translate3d(-9999px,-9999px,0)',
    transition: 'width 200ms, height 200ms',
  };

  const ringStyle = {
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: '1px solid rgba(200,169,126,0.5)',
    position: 'fixed',
    top: 0,
    left: 0,
    pointerEvents: 'none',
    zIndex: 9998,
    transform: 'translate3d(-9999px,-9999px,0)',
    transition: 'width 180ms,height 180ms,border 180ms',
  };

  return (
    <>
      <div ref={dotRef} style={{...dotStyle, width: hoverState.overInteractive ? 20 : 10, height: hoverState.overInteractive ? 20 : 10}} />
      <div ref={ringRef} style={{...ringStyle, width: hoverState.overInteractive ? 56 : 36, height: hoverState.overInteractive ? 56 : 36, borderStyle: hoverState.overTilt ? 'dashed' : 'solid'}} />
    </>
  );
}
