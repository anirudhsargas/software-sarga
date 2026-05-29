import React, { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import * as THREE from 'three'
import './Home.css'

export default function Home() {
  const canvasRef = useRef(null)

  /* ── CURSOR ── */
  useEffect(() => {
    const isMobile = window.innerWidth < 768
    if (isMobile) return

    // Scope cursor:none to home page only
    document.body.classList.add('home-cursor')

    const dot  = document.getElementById('cdot')
    const ring = document.getElementById('cring')
    if (!dot || !ring) return

    let mx = 0, my = 0, rx = 0, ry = 0
    const onMove = e => {
      mx = e.clientX; my = e.clientY
      dot.style.left = mx + 'px'; dot.style.top = my + 'px'
    }
    document.addEventListener('mousemove', onMove)

    let rafId
    const rl = () => {
      rx += (mx - rx) * .11; ry += (my - ry) * .11
      ring.style.left = rx + 'px'; ring.style.top = ry + 'px'
      rafId = requestAnimationFrame(rl)
    }
    rl()

    const allLinks = document.querySelectorAll('a,button,.mag-btn')
    allLinks.forEach(el => {
      el.addEventListener('mouseenter', () => { dot.classList.add('link'); ring.classList.add('link') })
      el.addEventListener('mouseleave', () => { dot.classList.remove('link'); ring.classList.remove('link') })
    })
    const allCards = document.querySelectorAll('.tilt-card')
    allCards.forEach(el => {
      el.addEventListener('mouseenter', () => ring.classList.add('card'))
      el.addEventListener('mouseleave', () => ring.classList.remove('card'))
    })

    return () => {
      document.body.classList.remove('home-cursor')
      document.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(rafId)
    }
  }, [])

  /* ── THREE.JS HERO ── */
  useEffect(() => {
    const canvas = document.getElementById('bg-canvas')
    if (!canvas) return

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
    const scene3 = new THREE.Scene()
    const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .1, 100)
    cam.position.z = 6

    const resizeCam = () => {
      renderer.setSize(innerWidth, innerHeight)
      cam.aspect = innerWidth / innerHeight
      cam.updateProjectionMatrix()
    }
    resizeCam()
    window.addEventListener('resize', resizeCam)

    const sheetCount = window.innerWidth < 768 ? 8 : 22
    const sheets = []
    const geo  = new THREE.PlaneGeometry(1.2, .85)
    const cols = [0x1a1a1a, 0x0f0f0f, 0x333333, 0x2a2a2a, 0xf0ede6]
    for (let i = 0; i < sheetCount; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: cols[i % cols.length], transparent: true,
        opacity: i % cols.length === 4 ? .1 : .06 + Math.random() * .06,
        side: THREE.DoubleSide
      })
      const m = new THREE.Mesh(geo, mat)
      m.position.set((Math.random() - .5) * 14, (Math.random() - .5) * 9, (Math.random() - .5) * 4 - 2)
      m.rotation.set(Math.random() * .5, Math.random() * .8, Math.random() * .4)
      m.userData = { vx: (Math.random() - .5) * .003, vy: (Math.random() - .5) * .002, vr: (Math.random() - .5) * .001, oy: m.position.y }
      scene3.add(m); sheets.push(m)
    }

    let camTX = 0, camTY = 0
    const onMouse = e => { camTX = (e.clientX / innerWidth - .5) * .55; camTY = -(e.clientY / innerHeight - .5) * .38 }
    document.addEventListener('mousemove', onMouse)

    let rafId
    const renderLoop = () => {
      rafId = requestAnimationFrame(renderLoop)
      cam.position.x += (camTX - cam.position.x) * .04
      cam.position.y += (camTY - cam.position.y) * .04
      sheets.forEach(s => {
        s.position.x += s.userData.vx; s.position.y += s.userData.vy; s.rotation.z += s.userData.vr
        if (s.position.x > 8) s.position.x = -8; if (s.position.x < -8) s.position.x = 8
        if (s.position.y > 6) s.position.y = -6; if (s.position.y < -6) s.position.y = 6
      })
      renderer.render(scene3, cam)
    }
    renderLoop()

    // Parallax sheets on scroll
    const onScroll = () => {
      sheets.forEach((s, i) => { s.position.y = s.userData.oy - window.scrollY * .0004 * (i % 3 + 1) })
      const pxbg = document.getElementById('pxbg')
      const parallaxEl = document.getElementById('parallax')
      if (pxbg && parallaxEl) {
        const r = parallaxEl.getBoundingClientRect()
        pxbg.style.transform = `translateY(${(r.top / innerHeight) * 55}px)`
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      cancelAnimationFrame(rafId)
      document.removeEventListener('mousemove', onMouse)
      window.removeEventListener('resize', resizeCam)
      window.removeEventListener('scroll', onScroll)
      renderer.dispose()
    }
  }, [])

  /* ── INTERACTIONS & OBSERVERS ── */
  useEffect(() => {
    // Hero word reveal
    document.querySelectorAll('.hero-title .word span').forEach((s, i) => {
      s.style.animation = `wordIn .85s ${.55 + i * .13}s cubic-bezier(.16,1,.3,1) forwards`
    })

    const isMobile = window.innerWidth < 768

    // Magnetic buttons
    if (!isMobile) {
      document.querySelectorAll('.mag-btn').forEach(btn => {
        btn.addEventListener('mousemove', e => {
          const r = btn.getBoundingClientRect()
          const dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2
          btn.style.transform = `translate(${dx * .24}px,${dy * .24}px)`; btn.style.transition = 'transform .08s'
        })
        btn.addEventListener('mouseleave', () => {
          btn.style.transform = 'translate(0,0)'; btn.style.transition = 'transform .55s cubic-bezier(.16,1,.3,1)'
        })
      })

      // 3D tilt cards
      document.querySelectorAll('.tilt-card').forEach(card => {
        card.addEventListener('mousemove', e => {
          const r = card.getBoundingClientRect()
          const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5
          card.style.transform = `perspective(800px) rotateX(${-y * 15}deg) rotateY(${x * 15}deg) translateY(-5px)`
          card.style.setProperty('--mx', `${(x + .5) * 100}%`); card.style.setProperty('--my', `${(y + .5) * 100}%`)
          card.style.transition = 'transform .08s ease-out'
        })
        card.addEventListener('mouseleave', () => {
          card.style.transform = 'perspective(800px) rotateX(0) rotateY(0) translateY(0)'
          card.style.transition = 'transform .65s cubic-bezier(.16,1,.3,1)'
        })
      })

      // 3D card scene tilt
      const cs = document.getElementById('cardScene')
      const sw = document.getElementById('showcase')
      if (sw && cs) {
        sw.addEventListener('mousemove', e => {
          const r = sw.getBoundingClientRect()
          const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5
          cs.style.transform = `perspective(1200px) rotateX(${-y * 11}deg) rotateY(${x * 13}deg)`
          cs.style.transition = 'transform .1s ease-out'
        })
        sw.addEventListener('mouseleave', () => {
          cs.style.transform = 'perspective(1200px) rotateX(0) rotateY(0)'
          cs.style.transition = 'transform .8s cubic-bezier(.16,1,.3,1)'
        })
      }
    }

    // Scroll reveal
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('vis') })
    }, { threshold: .14 })
    document.querySelectorAll(
      '.stat-item,.sec-eyebrow,.sec-h,.tilt-card,.depth-item,.parallax-content,.fc-title,.fc-sub,.fc-btns,.showcase-text'
    ).forEach(el => io.observe(el))
    document.querySelectorAll('.tilt-card').forEach((c, i) => { c.style.transitionDelay = `${i * .07}s` })

    // Count-up — stats strip
    const cio = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return
        const t = +e.target.dataset.target, suffix = t >= 100 ? '+' : ''
        let v = 0; const step = t / 55
        const tick = () => { v = Math.min(v + step, t); e.target.textContent = Math.floor(v) + suffix; if (v < t) requestAnimationFrame(tick) }
        requestAnimationFrame(tick); cio.unobserve(e.target)
      })
    }, { threshold: .35 })
    document.querySelectorAll('[data-target]').forEach(el => cio.observe(el))

    // Count-up — showcase & depth
    const dcio = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return
        e.target.querySelectorAll('.sh-num,.dc[data-t]').forEach(el => {
          const t = +(el.dataset.count || el.dataset.t || 0); let v = 0
          const tick = () => { v = Math.min(v + t / 52, t); el.textContent = t >= 1000 ? Math.floor(v / 1000) + 'K' : Math.floor(v); if (v < t) requestAnimationFrame(tick) }
          requestAnimationFrame(tick)
        })
        dcio.unobserve(e.target)
      })
    }, { threshold: .3 })
    document.querySelectorAll('#showcase,#depth').forEach(el => dcio.observe(el))

    // Sticky story visuals
    const visEls = [document.getElementById('vis1'), document.getElementById('vis2'), document.getElementById('vis3')]
    const sio = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return
        const idx = +e.target.dataset.step - 1
        visEls.forEach((v, i) => {
          if (!v) return
          v.style.opacity = i === idx ? '1' : '0'
          v.style.transform = i === idx ? 'translateY(0) scale(1)' : 'translateY(22px) scale(.94)'
          v.style.transition = 'opacity .55s ease-out,transform .55s ease-out'
        })
      })
    }, { threshold: .5, rootMargin: '-8% 0px -8% 0px' })
    document.querySelectorAll('.story-step').forEach(s => sio.observe(s))

    return () => { io.disconnect(); cio.disconnect(); dcio.disconnect(); sio.disconnect() }
  }, [])

  return (
    <>
      {/* Custom cursor — home only */}
      <div className="cur-dot" id="cdot" />
      <div className="cur-ring" id="cring" />

      {/* ── HERO ── */}
      <section className="hero" id="hero">
        <canvas id="bg-canvas" ref={canvasRef} />
        <div className="hero-grain" />
        <div className="hero-content">
          <div className="hero-badge">30 Years · Kozhikode · Kerala</div>
          <h1 className="hero-title">
            <span className="word"><span>Print</span></span>
            <span className="word"><span>Beyond</span></span>
            <br />
            <span className="word"><span>the</span></span>
            <span className="word"><span>Ordinary</span></span>
          </h1>
          <p className="hero-sub">Offset · Digital · Mementos · Wedding Cards — Perambur &amp; Meppayur</p>
          <div className="hero-actions">
            <a href="/design" className="mag-btn mag-fill">Design Now →</a>
            <a href="/contact" className="mag-btn mag-ghost">Place an Order</a>
            <a href="/services" className="mag-btn mag-ghost">Explore Services</a>
          </div>
        </div>
        <div className="hero-scroll"><span>Scroll</span><div className="scroll-bar" /></div>
      </section>

      {/* ── STATS ── */}
      <section className="stats-strip">
        <div className="stat-item"><div className="stat-num" data-target="30">0</div><div className="stat-label">Years of Excellence</div></div>
        <div className="stat-item"><div className="stat-num" data-target="5000">0</div><div className="stat-label">Happy Clients</div></div>
        <div className="stat-item"><div className="stat-num" data-target="2">0</div><div className="stat-label">Branches in Kerala</div></div>
        <div className="stat-item"><div className="stat-num" data-target="24">0</div><div className="stat-label">Hour Turnaround</div></div>
      </section>

      {/* ── 3D CARD SHOWCASE ── */}
      <section className="showcase-wrap">
        <div className="showcase" id="showcase">
          <div className="showcase-visual">
            <div className="card-scene" id="cardScene">
              <div className="print-card pc1">
                <div className="pc1-inner">
                  <div className="pc1-logo">Sarga</div>
                  <div className="pc1-dots"><div className="pc1-dot" /><div className="pc1-dot" /><div className="pc1-dot" /></div>
                  <div className="pc1-lines"><div className="pc1-line" style={{ width: '72%' }} /><div className="pc1-line" style={{ width: '52%' }} /></div>
                </div>
              </div>
              <div className="print-card pc2">
                <div className="pc2-inner">
                  <div className="pc2-title">Annual Report</div>
                  <div className="pc2-lines">
                    <div className="pc2-line" style={{ width: '92%' }} />
                    <div className="pc2-line" style={{ width: '72%' }} />
                    <div className="pc2-line" style={{ width: '82%' }} />
                  </div>
                </div>
              </div>
              <div className="print-card pc3"><div className="pc3-inner"><div className="pc3-mono">SP</div></div></div>
            </div>
            <div className="float-badge">
              <div className="float-badge-lbl">Turnaround</div>
              <div className="float-badge-val">24 hrs ⚡</div>
            </div>
          </div>
          <div className="showcase-text" id="showcaseText">
            <span className="sh-tag">Premium Print Studio</span>
            <h2 className="sh-title">Every Layer.<br /><em>Perfected.</em></h2>
            <p className="sh-body">From first proof to final cut, we obsess over every detail — paper weight, ink density, trim precision — so you never have to.</p>
            <div className="sh-divider" />
            <div className="sh-stats">
              <div><div className="sh-num" data-count="30">0</div><div className="sh-lbl">Years of Craft</div></div>
              <div><div className="sh-num" data-count="5000">0</div><div className="sh-lbl">Happy Clients</div></div>
              <div><div className="sh-num" data-count="2">0</div><div className="sh-lbl">Branches</div></div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STICKY STORY ── */}
      <section className="story" id="story">
        <div className="story-sticky">
          <div className="story-visual" id="vis1">
            <svg viewBox="0 0 260 260" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="30" y="40" width="200" height="140" rx="8" fill="#1a1a1a" stroke="#555555" strokeWidth="1.5"/>
              <rect x="50" y="62" width="80" height="8" rx="4" fill="#1a1a1a" opacity=".8"/>
              <rect x="50" y="80" width="140" height="5" rx="2.5" fill="#555555" opacity=".45"/>
              <rect x="50" y="94" width="110" height="5" rx="2.5" fill="#555555" opacity=".45"/>
              <rect x="50" y="118" width="68" height="46" rx="4" fill="#1a1a1a" opacity=".12" stroke="#1a1a1a" strokeWidth="1"/>
              <rect x="128" y="118" width="62" height="46" rx="4" fill="#555555" opacity=".12" stroke="#555555" strokeWidth="1"/>
              <circle cx="130" cy="210" r="6" fill="#1a1a1a"/>
              <circle cx="148" cy="210" r="6" fill="#555555" opacity=".35"/>
              <circle cx="166" cy="210" r="6" fill="#555555" opacity=".18"/>
              <animateTransform attributeName="transform" type="translate" values="0 0;0 -7;0 0" dur="4s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/>
            </svg>
          </div>
          <div className="story-visual" id="vis2" style={{ opacity: 0, transform: 'translateY(20px) scale(.95)' }}>
            <svg viewBox="0 0 260 260" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="50" y="30" width="160" height="100" rx="6" fill="#1a1a1a" stroke="#555555" strokeWidth="1.5"/>
              <rect x="70" y="50" width="80" height="6" rx="3" fill="#1a1a1a" opacity=".7"/>
              <rect x="70" y="65" width="120" height="4" rx="2" fill="#555555" opacity=".4"/>
              <rect x="70" y="75" width="90" height="4" rx="2" fill="#555555" opacity=".4"/>
              <rect x="60" y="148" width="140" height="50" rx="6" fill="#2a2a2a" stroke="#444" strokeWidth="1"/>
              <rect x="75" y="158" width="30" height="30" rx="3" fill="#333"/>
              <line x1="116" y1="165" x2="185" y2="165" stroke="#555" strokeWidth="3" strokeLinecap="round"/>
              <line x1="116" y1="175" x2="170" y2="175" stroke="#555" strokeWidth="3" strokeLinecap="round"/>
              <path d="M110 130 L110 148 M150 130 L150 148" stroke="#555555" strokeWidth="1.5" strokeDasharray="3 3"/>
              <animateTransform attributeName="transform" type="translate" values="0 0;0 -7;0 0" dur="4s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/>
            </svg>
          </div>
          <div className="story-visual" id="vis3" style={{ opacity: 0, transform: 'translateY(20px) scale(.95)' }}>
            <svg viewBox="0 0 260 260" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="40" y="80" width="180" height="110" rx="10" fill="#1a1a1a" stroke="#555555" strokeWidth="1.5"/>
              <path d="M60 116 H200" stroke="#555555" strokeWidth="1" opacity=".4"/>
              <circle cx="130" cy="148" r="17" fill="#1a1a1a" opacity=".14" stroke="#1a1a1a" strokeWidth="1.5"/>
              <path d="M122 148 L128 154 L138 142" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="90" cy="212" r="10" fill="#2a2a2a" stroke="#555555" strokeWidth="1.5"/>
              <circle cx="170" cy="212" r="10" fill="#2a2a2a" stroke="#555555" strokeWidth="1.5"/>
              <path d="M100 212 L160 212" stroke="#555555" strokeWidth="1.5"/>
              <path d="M30 182 Q42 170 58 176 Q62 160 82 155" stroke="#1a1a1a" strokeWidth="1" strokeDasharray="4 4" opacity=".45" fill="none"/>
              <animateTransform attributeName="transform" type="translate" values="0 0;0 -7;0 0" dur="4s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/>
            </svg>
          </div>
        </div>
        <div className="story-steps">
          <div className="story-step" data-step="1">
            <div className="step-tag">01 — Design</div>
            <h2 className="step-title">Your Vision,<br />Our Craft</h2>
            <p className="step-body">Share your idea — we bring it to life with precision design, brand-aligned layouts, and print-ready files optimized for every format.</p>
          </div>
          <div className="story-step" data-step="2">
            <div className="step-tag">02 — Print</div>
            <h2 className="step-title">State of the Art<br />Offset &amp; Digital</h2>
            <p className="step-body">From visiting cards to wedding invitations, our machines deliver rich colour, sharp detail, and consistent quality on every sheet.</p>
          </div>
          <div className="story-step" data-step="3">
            <div className="step-tag">03 — Deliver</div>
            <h2 className="step-title">On Time,<br />Every Time</h2>
            <p className="step-body">Quick turnaround across Perambur and Meppayur. Track your order live and receive it exactly when you need it.</p>
          </div>
        </div>
      </section>

      {/* ── SERVICES TILT GRID ── */}
      <section className="services" id="services">
        <div className="sec-header">
          <span className="sec-eyebrow">What We Do</span>
          <h2 className="sec-h">Crafted With<br />Precision &amp; Pride</h2>
        </div>
        <div className="tilt-grid">
          <div className="tilt-card"><div className="tilt-icon">🖨️</div><span className="tilt-name">Offset Printing</span><p className="tilt-desc">Rich, consistent colour for high-volume runs. Books, brochures, packaging — printed to perfection.</p><div className="tilt-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17L17 7M7 7h10v10"/></svg></div></div>
          <div className="tilt-card"><div className="tilt-icon">⚡</div><span className="tilt-name">Digital Printing</span><p className="tilt-desc">Fast-turnaround, short-run prints with variable data support for personalised campaigns.</p><div className="tilt-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17L17 7M7 7h10v10"/></svg></div></div>
          <div className="tilt-card"><div className="tilt-icon">💍</div><span className="tilt-name">Wedding Cards</span><p className="tilt-desc">Die-cut invitations, foil stamping, and handcrafted finishes for your most important day.</p><div className="tilt-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17L17 7M7 7h10v10"/></svg></div></div>
          <div className="tilt-card"><div className="tilt-icon">🏆</div><span className="tilt-name">Mementos &amp; Trophies</span><p className="tilt-desc">Custom awards, shields, and keepsakes for schools, corporates, and cultural events.</p><div className="tilt-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17L17 7M7 7h10v10"/></svg></div></div>
          <div className="tilt-card"><div className="tilt-icon">🖼️</div><span className="tilt-name">Photo Frames</span><p className="tilt-desc">Canvas prints, acrylic mounts, and premium frames that turn memories into art.</p><div className="tilt-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17L17 7M7 7h10v10"/></svg></div></div>
          <div className="tilt-card"><div className="tilt-icon">📦</div><span className="tilt-name">Bulk &amp; Corporate</span><p className="tilt-desc">Volume pricing, dedicated account management, and reliable delivery across Kerala.</p><div className="tilt-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17L17 7M7 7h10v10"/></svg></div></div>
        </div>
      </section>

      {/* ── DEPTH NUMBERS ── */}
      <section className="depth" id="depth">
        <div className="depth-row">
          <div className="depth-item"><div className="depth-big" data-shadow="30"><span className="dc" data-t="30">0</span><span className="depth-unit">+</span></div><div className="depth-label">Years of unbroken craft in Kozhikode</div></div>
          <div className="depth-item"><div className="depth-big" data-shadow="5K"><span className="dc" data-t="5000">0</span><span className="depth-unit">+</span></div><div className="depth-label">Clients across North Kerala</div></div>
          <div className="depth-item"><div className="depth-big" data-shadow="2"><span className="dc" data-t="2">0</span></div><div className="depth-label">Modern branches — Perambur &amp; Meppayur</div></div>
          <div className="depth-item"><div className="depth-big" data-shadow="24h"><span className="dc" data-t="24">0</span><span className="depth-unit">h</span></div><div className="depth-label">Average digital order turnaround</div></div>
        </div>
      </section>

      {/* ── MARQUEE ── */}
      <div className="marquee-wrap">
        <div className="marquee-track">
          {['Visiting Cards','Wedding Invitations','Offset Printing','Flex Banners','Brochures','Annual Reports','Mementos','Photo Frames','Die-cut Cards','Stickers',
            'Visiting Cards','Wedding Invitations','Offset Printing','Flex Banners','Brochures','Annual Reports','Mementos','Photo Frames','Die-cut Cards','Stickers'
          ].map((item, i) => {
            let targetUrl = `/products?q=${encodeURIComponent(item)}`;
            if (item === 'Offset Printing') targetUrl = '/products?category=Offset%20Printing';
            if (item === 'Mementos' || item === 'Photo Frames') targetUrl = '/products?category=Mementos%20%26%20Frames';
            return (
              <Link to={targetUrl} key={i} className="m-item">
                {item} <span className="m-dot" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── PARALLAX ── */}
      <section className="parallax-section" id="parallax">
        <div className="parallax-bg" id="pxbg" />
        <div className="parallax-content" id="pxcontent">
          <span className="parallax-eyebrow">Since 1994</span>
          <h2 className="parallax-title">Three Decades of<br /><em>Ink &amp; Integrity</em></h2>
          <p className="parallax-sub">From a single press in Perambur to a modern multi-branch printing studio trusted by thousands across Kozhikode.</p>
          <a href="/contact" className="mag-btn mag-fill">Our Story →</a>
        </div>
      </section>

      {/* ── FOOTER CTA ── */}
      <section className="footer-cta" id="cta">
        <h2 className="fc-title">Ready to Print<br />Something Beautiful?</h2>
        <p className="fc-sub">Talk to our team today — free consultation, fast quote, guaranteed quality.</p>
        <div className="fc-btns">
          <a href="/contact" className="mag-btn btn-dark" style={{ marginRight: '.8rem' }}>Place an Order →</a>
          <a href="tel:+919495177283" className="mag-btn btn-border">Call Us</a>
        </div>
      </section>
    </>
  )
}
