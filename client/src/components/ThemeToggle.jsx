import { useState, useEffect, useRef } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '../theme/ThemeProvider'

const modes = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
]

export default function ThemeToggle({ showLabel = false, variant = 'dropdown' }) {
  const { theme: current, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const activeMode = modes.find(m => m.value === current) || modes[2]
  const ActiveIcon = activeMode.icon

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Toggle theme"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: showLabel ? '8px 14px' : '8px',
          borderRadius: 10, border: '1px solid var(--border)',
          background: 'var(--surface-2)', color: 'var(--text)',
          cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
          transition: 'all 0.15s', whiteSpace: 'nowrap',
        }}
      >
        <ActiveIcon size={18} />
        {showLabel && <span>{activeMode.label}</span>}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: 'var(--shadow-lg)',
            padding: 4, zIndex: 9999, minWidth: 150,
          }}
        >
          {modes.map(m => {
            const Icon = m.icon
            return (
              <button
                key={m.value}
                onClick={() => { setTheme(m.value); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '8px 12px', borderRadius: 8, border: 'none',
                  background: current === m.value ? 'var(--accent-soft)' : 'transparent',
                  color: 'var(--text)', cursor: 'pointer', fontSize: '0.85rem',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => {
                  if (current !== m.value) e.currentTarget.style.background = 'transparent'
                }}
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
