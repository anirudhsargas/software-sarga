import { useState, useEffect, useCallback } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import theme from '../theme'

const modes = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
]

export default function ThemeToggle() {
  const [current, setCurrent] = useState(theme.getStoredTheme)
  const [open, setOpen] = useState(false)

  const select = useCallback((mode) => {
    theme.setTheme(mode)
    setCurrent(mode)
    setOpen(false)
  }, [])

  useEffect(() => {
    const handleClick = (e) => {
      if (!e.target.closest('.theme-toggle')) setOpen(false)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  const activeIcon = modes.find(m => m.value === current) || modes[2]

  return (
    <div className="theme-toggle" style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Toggle theme"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--surface)', color: 'var(--text)',
          cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
          transition: 'all 0.2s',
        }}
      >
        {modes.map(m => {
          const Icon = m.icon
          return (
            <Icon
              key={m.value}
              size={16}
              style={{
                transition: 'all 0.2s',
                opacity: current === m.value ? 1 : 0.3,
              }}
            />
          )
        })}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: 'var(--shadow-lg)',
            padding: 4, zIndex: 100, minWidth: 140,
          }}
        >
          {modes.map(m => {
            const Icon = m.icon
            return (
              <button
                key={m.value}
                onClick={() => select(m.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '8px 12px', borderRadius: 6, border: 'none',
                  background: current === m.value ? 'var(--accent-soft)' : 'transparent',
                  color: 'var(--text)', cursor: 'pointer', fontSize: '0.85rem',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (current !== m.value) e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { if (current !== m.value) e.currentTarget.style.background = 'transparent' }}
              >
                <Icon size={16} />
                <span>{m.label}</span>
                {current === m.value && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem', opacity: 0.5 }}>✓</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
