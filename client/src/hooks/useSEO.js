import { useEffect } from 'react';

export const useSEO = (title, description) => {
    useEffect(() => {
        const siteTitle = 'SARGA';
        const fullTitle = title ? `${title} · ${siteTitle}` : siteTitle;
        document.title = fullTitle;

        const defaultDescription = 'Manage Sarga Printing operations including billing, inventory, customers, reports, expense tracking, orders, and production in one system.';
        const finalDescription = description || defaultDescription;

        let metaDesc = document.querySelector('meta[name="description"]');
        if (!metaDesc) {
            metaDesc = document.createElement('meta');
            metaDesc.name = "description";
            document.head.appendChild(metaDesc);
        }
        metaDesc.setAttribute('content', finalDescription);

        let ogTitle = document.querySelector('meta[property="og:title"]');
        if (!ogTitle) {
            ogTitle = document.createElement('meta');
            ogTitle.setAttribute('property', 'og:title');
            document.head.appendChild(ogTitle);
        }
        ogTitle.setAttribute('content', fullTitle);

        let ogDesc = document.querySelector('meta[property="og:description"]');
        if (!ogDesc) {
            ogDesc = document.createElement('meta');
            ogDesc.setAttribute('property', 'og:description');
            document.head.appendChild(ogDesc);
        }
        ogDesc.setAttribute('content', finalDescription);

        let favicon = document.querySelector('link[rel="icon"]');
        if (!favicon) {
            favicon = document.createElement('link');
            favicon.rel = "icon";
            document.head.appendChild(favicon);
        }
        favicon.setAttribute('href', '/icons/icon-192.png');

        let twTitle = document.querySelector('meta[name="twitter:title"]');
        if (twTitle) twTitle.setAttribute('content', fullTitle);

        let twDesc = document.querySelector('meta[name="twitter:description"]');
        if (twDesc) twDesc.setAttribute('content', finalDescription);

        let canonical = document.querySelector('link[rel="canonical"]');
        if (canonical) canonical.setAttribute('href', window.location.href);

    }, [title, description]);
};
