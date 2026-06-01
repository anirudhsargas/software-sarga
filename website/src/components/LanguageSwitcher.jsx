import { useI18n } from '../context/I18nContext'

export default function LanguageSwitcher() {
  const { lang, setLang } = useI18n()

  return (
    <div className="lang-switcher" style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      <button
        onClick={() => setLang('en')}
        style={{
          padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600,
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '6px 0 0 6px', cursor: 'pointer',
          background: lang === 'en' ? 'var(--primary, #2563eb)' : 'transparent',
          color: lang === 'en' ? '#fff' : 'var(--text-primary, #1a1a2e)',
          transition: 'all 0.2s'
        }}
        aria-label="Switch to English"
      >
        EN
      </button>
      <button
        onClick={() => setLang('ml')}
        style={{
          padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600,
          border: '1px solid var(--border-color, #e2e8f0)',
          borderLeft: 'none', borderRadius: '0 6px 6px 0', cursor: 'pointer',
          background: lang === 'ml' ? 'var(--primary, #2563eb)' : 'transparent',
          color: lang === 'ml' ? '#fff' : 'var(--text-primary, #1a1a2e)',
          transition: 'all 0.2s'
        }}
        aria-label="Switch to Malayalam"
      >
        മല
      </button>
    </div>
  )
}
