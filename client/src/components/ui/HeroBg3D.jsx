import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const HeroBg3D = React.memo(function HeroBg3D() {
  const mountRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const container = mountRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.z = 10;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(width, height);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = 0;
    renderer.domElement.style.left = 0;
    renderer.domElement.style.pointerEvents = 'none';
    renderer.domElement.style.zIndex = 0;
    container.appendChild(renderer.domElement);

    // sheet params
    const sheetCount = window.innerWidth < 768 ? 8 : 20;
    const colors = ['#1e3028', '#c8a97e', '#3d8c7a', '#2a2a2a'];

    const sheets = [];
    const geo = new THREE.PlaneGeometry(1.2, 0.85);

    for (let i = 0; i < sheetCount; i++) {
      const clr = colors[i % colors.length];
      const mat = new THREE.MeshBasicMaterial({ color: clr, transparent: true, opacity: Math.random() * 0.06 + 0.06, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.x = (Math.random() - 0.5) * 16; // ±8
      mesh.position.y = (Math.random() - 0.5) * 12; // ±6
      mesh.position.z = -6 + Math.random() * 6; // -6..0
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.userData.vx = (Math.random() - 0.5) * 0.002;
      mesh.userData.vy = (Math.random() - 0.5) * 0.002;
      mesh.userData.vr = (Math.random() - 0.5) * 0.0015;
      sheets.push(mesh);
      scene.add(mesh);
    }

    let mouseX = 0, mouseY = 0, targetCamX = 0, targetCamY = 0;

    function onMove(e) {
      const nx = (e.clientX / window.innerWidth - 0.5) * 0.6;
      const ny = (e.clientY / window.innerHeight - 0.5) * 0.6;
      targetCamX = nx;
      targetCamY = ny;
    }

    function onScroll() {
      const sy = window.scrollY || window.pageYOffset;
      const speed = 0.0006;
      sheets.forEach((s, idx) => {
        s.position.y += sy * speed * (1 + (idx % 3) * 0.3);
      });
    }

    function onResize() {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    function wrapPosition(obj) {
      if (obj.position.x < -8) obj.position.x = 8;
      if (obj.position.x > 8) obj.position.x = -8;
      if (obj.position.y < -6) obj.position.y = 6;
      if (obj.position.y > 6) obj.position.y = -6;
    }

    const animate = () => {
      // lerp camera
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

    animate();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      sheets.forEach(s => {
        if (s.geometry) s.geometry.dispose();
        if (s.material) s.material.dispose();
        scene.remove(s);
      });
      geo.dispose();
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={mountRef} style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }} />
  );
});

export default HeroBg3D;
