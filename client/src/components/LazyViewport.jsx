import React, { useState, useEffect, useRef } from 'react';

/**
 * LazyViewport defers rendering its children until they are close to entering the viewport.
 * This is useful for lazy-loading heavy bundles (like Recharts) that are below the fold.
 */
export default function LazyViewport({
  children,
  fallback = null,
  threshold = 0.05,
  rootMargin = '150px',
  minHeight = '100px',
}) {
  const [inView, setInView] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInView(true);
            io.unobserve(el);
          }
        });
      },
      { threshold, rootMargin }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [threshold, rootMargin]);

  return (
    <div ref={ref} style={inView ? undefined : { minHeight }}>
      {inView ? children : fallback}
    </div>
  );
}
