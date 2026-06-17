const STORAGE_KEY = 'sarga_theme'
const VALID_MODES = ['light', 'dark', 'system']

function getSystemPref() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function isValidTheme(mode) {
  return VALID_MODES.includes(mode)
}

function applyTheme(mode) {
  const el = document.documentElement
  const effective = mode === 'system' ? getSystemPref() : mode
  // Scope transitions during theme switch to prevent layout thrashing
  el.classList.add('theme-transitioning')
  el.setAttribute('data-theme', effective)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.remove('theme-transitioning')
    })
  })
}

function setTheme(mode) {
  const resolved = isValidTheme(mode) ? mode : 'dark'
  localStorage.setItem(STORAGE_KEY, resolved)
  applyTheme(resolved)
  setupSystemListener(resolved)
}

function getStoredTheme() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && isValidTheme(stored)) return stored
  localStorage.setItem(STORAGE_KEY, 'dark')
  return 'dark'
}

function getResolvedTheme() {
  const stored = getStoredTheme()
  return stored === 'system' ? getSystemPref() : stored
}

let mqListener = null
let currentMode = null

function setupSystemListener(mode) {
  currentMode = mode
  if (mqListener) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', mqListener)
    } catch (e) {}
    mqListener = null
  }
  if (mode === 'system') {
    mqListener = (e) => {
      applyTheme('system')
    }
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', mqListener)
    } catch (e) {
      try {
        window.matchMedia('(prefers-color-scheme: dark)').addListener(mqListener)
      } catch (_) {}
    }
  }
}

let initDone = false

function init() {
  if (initDone) return
  initDone = true
  const stored = getStoredTheme()
  applyTheme(stored)
  setupSystemListener(stored)
}

export default { init, setTheme, getStoredTheme, getResolvedTheme, applyTheme, VALID_MODES }
