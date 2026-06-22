import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { CANONICAL_DOMAIN, routeMeta } from './routeMeta';

const FALLBACK_META = {
  title: 'Sarga Offset Printing',
  description:
    'Sarga Offset delivers high-quality offset printing, packaging, labels, and branding solutions.',
};

export default function SEOProvider({ routeKey, children }) {
  const location = useLocation();
  const meta = routeMeta[routeKey] || FALLBACK_META;

  const canonical = `${CANONICAL_DOMAIN}${location.pathname}`;
  const fullTitle = meta.title;
  const description = meta.description;
  const ogTitle = meta.ogTitle || fullTitle;
  const ogDescription = meta.ogDescription || description;
  const twitterTitle = meta.twitterTitle || fullTitle;
  const twitterDescription = meta.twitterDescription || description;
  const ogImage = `${CANONICAL_DOMAIN}/og-image.jpg`;

  useEffect(() => {
    document.title = fullTitle;

    let metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', description);

    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink) canonicalLink.setAttribute('href', canonical);
  }, [fullTitle, description, canonical]);

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />

      <meta property="og:type" content="website" />
      <meta property="og:title" content={ogTitle} />
      <meta property="og:description" content={ogDescription} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:site_name" content="Sarga Offset Printing" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={twitterTitle} />
      <meta name="twitter:description" content={twitterDescription} />
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  );
}
