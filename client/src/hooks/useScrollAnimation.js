import { useEffect, useRef } from 'react';

export default function useScrollAnimation(options = {}) {
  const { threshold = 0.12, rootMargin = '0px', stagger = false, staggerSelector = '[data-stagger] > *' } = options;
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const activate = () => {
      el.classList.add('animate-fade-up');
      el.classList.add('animate-in');
      if (stagger) {
        const items = el.querySelectorAll(staggerSelector);
        items.forEach((it, i) => {
          it.style.transitionDelay = `${i * 60}ms`;
          it.classList.add('stagger-item');
        });
      }
    };

    if (typeof IntersectionObserver === 'undefined') {
      activate();
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          activate();
          io.unobserve(entry.target);
        }
      });
    }, { threshold, rootMargin });

    io.observe(el);
    return () => io.disconnect();
  }, [threshold, rootMargin, stagger, staggerSelector]);

  return ref;
}
