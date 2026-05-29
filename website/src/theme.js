// Theme manager: supports 'light', 'dark', and 'system' modes
const STORAGE_KEY = 'sarga_theme'

function getSystemPref() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(mode) {
  const el = document.documentElement
  let effective = mode
  if (mode === 'system') effective = getSystemPref()
  el.setAttribute('data-theme', effective)
}

function setTheme(mode) {
  localStorage.setItem(STORAGE_KEY, mode)
  applyTheme(mode)
  // if mode === system, listen for changes
  setupSystemListener(mode)
}

function getStoredTheme() {
  return localStorage.getItem(STORAGE_KEY) || 'system'
}

let mqListener = null
function setupSystemListener(mode) {
  if (mqListener) {
    try { window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', mqListener) } catch(e) {}
    mqListener = null
  }
  if (mode === 'system' && window.matchMedia) {
    mqListener = (e) => { applyTheme('system') }
    try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', mqListener) } catch(e) {
      // fallback for older browsers
      try { window.matchMedia('(prefers-color-scheme: dark)').addListener(mqListener) } catch(_) {}
    }
  }
}

function init() {
  const stored = getStoredTheme()
  applyTheme(stored)
  setupSystemListener(stored)
}

export default { init, setTheme, getStoredTheme, applyTheme }
