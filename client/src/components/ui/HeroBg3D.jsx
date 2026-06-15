import React, { useEffect, useRef, useState } from 'react';

function ThreeScene({ THREE, mountRef }) {
  const rafRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !mountRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(max-width: 768px)').matches) return;

    const container = mountRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.z = 10;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = 0;
    renderer.domElement.style.left = 0;
    renderer.domElement.style.pointerEvents = 'none';
    renderer.domElement.style.zIndex = 0;
    container.appendChild(renderer.domElement);

    const sheetCount = 12;
    const colors = ['#1e3028', '#c8a97e', '#3d8c7a', '#2a2a2a'];
    const sheets = [];
    const geo = new THREE.PlaneGeometry(1.2, 0.85);

    for (let i = 0; i < sheetCount; i++) {
      const clr = colors[i % colors.length];
      const mat = new THREE.MeshBasicMaterial({ color: clr, transparent: true, opacity: Math.random() * 0.06 + 0.06, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.x = (Math.random() - 0.5) * 16;
      mesh.position.y = (Math.random() - 0.5) * 12;
      mesh.position.z = -6 + Math.random() * 6;
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.userData.vx = (Math.random() - 0.5) * 0.002;
      mesh.userData.vy = (Math.random() - 0.5) * 0.002;
      mesh.userData.vr = (Math.random() - 0.5) * 0.0015;
      sheets.push(mesh);
      scene.add(mesh);
    }

    let targetCamX = 0;
    let targetCamY = 0;

    const onMove = (e) => {
      targetCamX = (e.clientX / window.innerWidth - 0.5) * 0.6;
      targetCamY = (e.clientY / window.innerHeight - 0.5) * 0.6;
    };

    const onScroll = () => {
      const sy = window.scrollY || window.pageYOffset;
      const speed = 0.0004;
      sheets.forEach((s, idx) => {
        s.position.y += sy * speed * (1 + (idx % 3) * 0.3);
      });
    };

    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      } else if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibilityChange);

    const wrapPosition = (obj) => {
      if (obj.position.x < -8) obj.position.x = 8;
      if (obj.position.x > 8) obj.position.x = -8;
      if (obj.position.y < -6) obj.position.y = 6;
      if (obj.position.y > 6) obj.position.y = -6;
    };

    const animate = () => {
      camera.position.x += (targetCamX - camera.position.x) * 0.06;
      camera.position.y += (targetCamY - camera.position.y) * 0.06;

      sheets.forEach((s) => {
        s.position.x += s.userData.vx;
        s.position.y += s.userData.vy;
        s.rotation.z += s.userData.vr;
        wrapPosition(s);
      });

      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      sheets.forEach((s) => {
        if (s.geometry) s.geometry.dispose();
        if (s.material) s.material.dispose();
        scene.remove(s);
      });
      geo.dispose();
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, [THREE, mountRef]);

  return null;
}

const HeroBg3D = React.memo(function HeroBg3D() {
  const mountRef = useRef(null);
  const [shouldRender, setShouldRender] = useState(false);
  const [THREE, setTHREE] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(max-width: 768px)').matches) return;

    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(() => setShouldRender(true), { timeout: 1800 })
      : window.setTimeout(() => setShouldRender(true), 1800);

    return () => {
      if (window.requestIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, []);

  useEffect(() => {
    if (!shouldRender) return;
    let cancelled = false;
    import('three').then((module) => {
      if (!cancelled) setTHREE(module);
    });
    return () => {
      cancelled = true;
    };
  }, [shouldRender]);

  return (
    <div
      ref={mountRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        background: 'radial-gradient(circle at 20% 20%, rgba(47, 125, 74, 0.18), transparent 34%), radial-gradient(circle at 80% 10%, rgba(31, 42, 51, 0.12), transparent 32%), linear-gradient(135deg, rgba(251, 250, 247, 0.72), rgba(235, 232, 225, 0.36))',
      }}
    >
      {THREE && <ThreeScene THREE={THREE} mountRef={mountRef} />}
    </div>
  );
});

export default HeroBg3D;
