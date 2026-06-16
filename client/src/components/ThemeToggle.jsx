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
    <div ref={ref} className="theme-toggle-wrapper">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Toggle theme"
        className={`theme-toggle-btn ${!showLabel ? 'theme-toggle-btn--icon-only' : ''}`}
      >
        <ActiveIcon size={18} />
        {showLabel && <span>{activeMode.label}</span>}
      </button>
      {open && (
        <div className="theme-toggle-dropdown">
          {modes.map(m => {
            const Icon = m.icon
            return (
              <button
                key={m.value}
                onClick={() => { setTheme(m.value); setOpen(false) }}
                className={`theme-toggle-option ${current === m.value ? 'theme-toggle-option--active' : ''}`}
              >
                <Icon size={16} />
                <span>{m.label}</span>
                {current === m.value && (
                  <span className="theme-toggle-option__check">✓</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
