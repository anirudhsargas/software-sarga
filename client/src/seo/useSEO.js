import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { CANONICAL_DOMAIN, routeMeta } from './routeMeta';

const FALLBACK = {
  title: 'Sarga Offset Printing',
  description:
    'Sarga Offset delivers high-quality offset printing, packaging, labels, and branding solutions.',
};

export function useSEO(routeKey) {
  const location = useLocation();
  const meta = routeMeta[routeKey] || FALLBACK;

  const canonical = `${CANONICAL_DOMAIN}${location.pathname}`;
  const fullTitle = meta.title;
  const description = meta.description;
  const ogImage = `${CANONICAL_DOMAIN}/og-image.jpg`;

  useEffect(() => {
    document.title = fullTitle;

    const upsertMeta = (selector, attr, value) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        const [, name, key] = selector.match(/\[([^\]]+)="([^"]+)"\]/) || [];
        if (name === 'name') el.name = key;
        if (name === 'property') el.setAttribute('property', key);
        document.head.appendChild(el);
      }
      el.setAttribute(attr, value);
    };

    upsertMeta('meta[name="description"]', 'content', description);
    upsertMeta('meta[property="og:title"]', 'content', fullTitle);
    upsertMeta('meta[property="og:description"]', 'content', description);
    upsertMeta('meta[property="og:url"]', 'content', canonical);
    upsertMeta('meta[property="og:image"]', 'content', ogImage);
    upsertMeta('meta[name="twitter:title"]', 'content', fullTitle);
    upsertMeta('meta[name="twitter:description"]', 'content', description);
    upsertMeta('meta[name="twitter:image"]', 'content', ogImage);

    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink) {
      canonicalLink.setAttribute('href', canonical);
    } else {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      canonicalLink.href = canonical;
      document.head.appendChild(canonicalLink);
    }
  }, [routeKey, fullTitle, description, canonical, ogImage]);
}
