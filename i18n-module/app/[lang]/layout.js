import fs from 'fs'
import path from 'path'
import { cookies } from 'next/headers'
import LanguageSwitcher from '../../components/LanguageSwitcher'

function loadTranslations(lang){
  const file = path.join(process.cwd(), 'i18n-module', 'public', 'locales', lang, 'common.json')
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file,'utf8'))
  return {}
}

export default function LangLayout({ children, params }){
  const lang = params.lang || 'en'
  const t = loadTranslations(lang)
  const cookieStore = cookies();
  // set language cookie for persistence (server side set not available here, client will set as well)
  return (
    <html lang={lang}>
      <body>
        <header className="p-4 border-b flex justify-between items-center">
          <nav className="flex gap-4">
            <a href={`/${lang}`}>{t.nav?.home || 'Home'}</a>
            <a href={`/${lang}/products`}>{t.nav?.products || 'Products'}</a>
            <a href={`/${lang}/blog`}>{t.nav?.blog || 'Blog'}</a>
          </nav>
          <LanguageSwitcher current={lang} />
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
