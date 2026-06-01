import { loadAll, getSeo } from '../../lib/i18n'

export async function generateMetadata({ params }){
  const lang = params.lang || 'en'
  const seo = getSeo(lang)
  return {
    title: seo.title || 'Sarga Printing',
    description: seo.description || 'Local printing services in Kerala'
  }
}

export default function LangHome({ params }){
  const lang = params.lang || 'en'
  const t = loadAll(lang)
  return (
    <section className="p-6">
      <h1 className="text-3xl font-bold">{t.common?.home?.headline || 'Welcome'}</h1>
      <p className="mt-4">{t.common?.seo?.description || 'Local printing services'}</p>
      <a className="mt-6 inline-block px-3 py-2 bg-blue-600 text-white rounded" href={`/${lang}/products/wedding-cards`}>{t.common?.home?.cta || 'See products'}</a>
    </section>
  )
}
