import React from 'react';
import { Helmet } from 'react-helmet-async';

const SEO = ({ title, description, url, image, type = 'website' }) => {
    const siteTitle = 'Sarga Printing';
    const fullTitle = title ? `${title} | ${siteTitle}` : siteTitle;
    const defaultDescription = 'Manage Sarga Printing operations including billing, inventory, customers, reports, expense tracking, orders, and production in one system.';
    const finalDescription = description || defaultDescription;
    const canonicalUrl = url ? `https://software-sarga-2.onrender.com${url}` : 'https://software-sarga-2.onrender.com/';
    const ogImage = image || 'https://software-sarga-2.onrender.com/icons/icon-512.png';

    return (
        <Helmet>
            <title>{fullTitle}</title>
            <meta name="description" content={finalDescription} />
            <link rel="canonical" href={canonicalUrl} />

            {/* Open Graph / Facebook */}
            <meta property="og:type" content={type} />
            <meta property="og:url" content={canonicalUrl} />
            <meta property="og:title" content={fullTitle} />
            <meta property="og:description" content={finalDescription} />
            <meta property="og:image" content={ogImage} />

            {/* Twitter */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:url" content={canonicalUrl} />
            <meta name="twitter:title" content={fullTitle} />
            <meta name="twitter:description" content={finalDescription} />
            <meta name="twitter:image" content={ogImage} />
        </Helmet>
    );
};

export default SEO;
