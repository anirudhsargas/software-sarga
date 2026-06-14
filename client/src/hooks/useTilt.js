import { useRef, useEffect } from 'react';

export default function useTilt() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    let raf = null;

    function onMove(e) {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        const cx = rect.left + w / 2;
        const cy = rect.top + h / 2;
        const x = (e.clientX - cx) / w; // -0.5..0.5-ish
        const y = (e.clientY - cy) / h;

        const rx = (-y * 16).toFixed(2);
        const ry = (x * 16).toFixed(2);

        el.style.willChange = 'transform';
        el.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
        el.style.setProperty('--mx', x.toString());
        el.style.setProperty('--my', y.toString());
      });
    }

    function onLeave() {
      if (raf) cancelAnimationFrame(raf);
      el.style.transition = 'transform 0.6s cubic-bezier(.16,1,.3,1)';
      el.style.transform = '';
      el.style.setProperty('--mx', '0');
      el.style.setProperty('--my', '0');
      raf = requestAnimationFrame(() => {
        el.style.transition = '';
      });
    }

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);

    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return { ref };
}
