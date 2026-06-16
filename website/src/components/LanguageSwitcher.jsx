import { useI18n } from '../context/I18nContext'

export default function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n()

  return (
    <div className="lang-switcher" style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      <button
        onClick={() => setLang('en')}
        style={{
          padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600,
          border: '1px solid var(--border)',
          borderRadius: '6px 0 0 6px', cursor: 'pointer',
          background: lang === 'en' ? 'var(--accent)' : 'transparent',
          color: lang === 'en' ? 'var(--on-accent)' : 'var(--text)',
          transition: 'all 0.2s'
        }}
        aria-label={t('language.switch_to_en')}
      >
        {t('language.en')}
      </button>
      <button
        onClick={() => setLang('ml')}
        style={{
          padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600,
          border: '1px solid var(--border)',
          borderLeft: 'none', borderRadius: '0 6px 6px 0', cursor: 'pointer',
          background: lang === 'ml' ? 'var(--accent)' : 'transparent',
          color: lang === 'ml' ? 'var(--on-accent)' : 'var(--text)',
          transition: 'all 0.2s'
        }}
        aria-label={t('language.switch_to_ml')}
      >
        {t('language.ml')}
      </button>
    </div>
  )
}
