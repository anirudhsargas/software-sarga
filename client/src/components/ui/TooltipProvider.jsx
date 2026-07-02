import { useEffect, useRef, useState } from 'react';

export default function TooltipProvider({ children }) {
  const [state, setState] = useState({ visible: false, text: '', x: 0, y: 0 });
  const elRef = useRef(null);

  useEffect(() => {
    const handleOver = (e) => {
      const el = e.target.closest('[title]');
      if (!el) return;
      const text = el.getAttribute('title');
      if (!text) return;

      idRef.current += 1;
      elRef.current = el;
      el.setAttribute('data-sarga-title', text);
      el.removeAttribute('title');

      const rect = el.getBoundingClientRect();
      setState({ visible: true, text, x: rect.left + rect.width / 2, y: rect.top - 10 });
    };

    const handleOut = (e) => {
      const el = e.target.closest('[title], [data-sarga-title]');
      if (!el) return;

      if (elRef.current) {
        const saved = elRef.current.getAttribute('data-sarga-title');
        if (saved) {
          elRef.current.setAttribute('title', saved);
          elRef.current.removeAttribute('data-sarga-title');
        }
        elRef.current = null;
      }
      setState({ visible: false, text: '', x: 0, y: 0 });
    };

    document.addEventListener('mouseover', handleOver);
    document.addEventListener('mouseout', handleOut);

    return () => {
      document.removeEventListener('mouseover', handleOver);
      document.removeEventListener('mouseout', handleOut);
      if (elRef.current) {
        const saved = elRef.current.getAttribute('data-sarga-title');
        if (saved) {
          elRef.current.setAttribute('title', saved);
          elRef.current.removeAttribute('data-sarga-title');
        }
      }
    };
  }, []);

  return (
    <>
      {children}
      {state.visible && (
        <div
          className="sarga-tooltip"
          role="tooltip"
          style={{ left: state.x, top: state.y }}
        >
          {state.text}
        </div>
      )}
    </>
  );
}
