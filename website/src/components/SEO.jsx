import { useEffect } from 'react'

export default function SEO({ title, description, ogImage, ogType = 'website', canonical, schema }) {
  const siteName = 'Sarga Prints'
  const siteUrl = import.meta.env.VITE_SITE_URL || 'https://sarga.in'
  const defaultTitle = 'Sarga Prints | Premium Printing & Design Studio in Kozhikode'
  const defaultDesc = 'Sarga Prints is Kozhikode\'s leading offset & digital printing studio. We offer mementos, photo frames, hard binding, and live custom design tools across Perambra & Meppayur.'
  const defaultImage = `${siteUrl}/og-image.jpg`

  const finalTitle = title ? `${title} | ${siteName}` : defaultTitle
  const finalDesc = description || defaultDesc
  const finalImage = ogImage || defaultImage
  const finalCanonical = canonical || (typeof window !== 'undefined' ? window.location.href.split('?')[0] : siteUrl)

  useEffect(() => {
    document.title = finalTitle
    setMeta('description', finalDesc)
    setMeta('og:title', finalTitle)
    setMeta('og:description', finalDesc)
    setMeta('og:image', finalImage)
    setMeta('og:url', finalCanonical)
    setMeta('og:type', ogType)
    setMeta('og:site_name', siteName)
    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', finalTitle)
    setMeta('twitter:description', finalDesc)
    setMeta('twitter:image', finalImage)
    setCanonical(finalCanonical)
    setSchema(schema)
  }, [title, description, ogImage, ogType, canonical])

  return null
}

function setMeta(name, content) {
  if (!content) return
  let el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    if (name.startsWith('og:')) el.setAttribute('property', name)
    else el.setAttribute('name', name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setCanonical(url) {
  let el = document.querySelector('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', url)
}

function setSchema(schema) {
  if (!schema) return
  let el = document.querySelector('script[type="application/ld+json"]')
  if (!el) {
    el = document.createElement('script')
    el.setAttribute('type', 'application/ld+json')
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(schema)
}
