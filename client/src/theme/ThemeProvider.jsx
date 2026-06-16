import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../services/api';

const ThemeContext = createContext();
export const useTheme = () => useContext(ThemeContext);

const VALID_MODES = ['light', 'dark', 'system'];
const STORAGE_KEY = 'app-theme';

function getSystemPref() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function isValidTheme(mode) {
  return VALID_MODES.includes(mode);
}

function applyThemeToDOM(resolvedTheme) {
  if (typeof document !== 'undefined') {
    const isDark = resolvedTheme === 'dark';
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.body.setAttribute('data-theme', resolvedTheme);
    document.documentElement.style.colorScheme = resolvedTheme;

    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    const meta = document.getElementById('theme-color');
    if (meta) {
      meta.content = isDark ? '#0a0a0a' : '#fafafa';
    }
  }
}

function loadPersistedTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch (e) { /* ignore */ }

  if (saved && isValidTheme(saved)) {
    return saved;
  }

  try {
    const userObj = JSON.parse(localStorage.getItem('user') || '{}');
    const backendTheme = userObj?.settings?.theme;
    if (backendTheme && isValidTheme(backendTheme)) {
      localStorage.setItem(STORAGE_KEY, backendTheme);
      return backendTheme;
    }
  } catch (e) { /* ignore */ }

  // If no saved value → create "system"
  try {
    localStorage.setItem(STORAGE_KEY, 'system');
  } catch (e) { /* ignore */ }
  return 'system';
}

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeMode] = useState(loadPersistedTheme);
  const [systemPref, setSystemPref] = useState(getSystemPref);

  // Sync state with OS changes
  useEffect(() => {
    try {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e) => {
        setSystemPref(e.matches ? 'dark' : 'light');
      };
      
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', listener);
        return () => mediaQuery.removeEventListener('change', listener);
      } else {
        // Fallback for older browsers
        mediaQuery.addListener(listener);
        return () => mediaQuery.removeListener(listener);
      }
    } catch (e) { /* ignore */ }
  }, []);

  // Compute resolved theme
  const resolvedTheme = themeMode === 'system' ? systemPref : themeMode;

  // Apply resolved theme whenever it changes
  useEffect(() => {
    applyThemeToDOM(resolvedTheme);
  }, [resolvedTheme]);

  const syncToBackend = useCallback((mode) => {
    const token = localStorage.getItem('token');
    if (!token) return;

    api.patch('/staff/settings', { settings: { theme: mode } })
      .then(() => {
        try {
          const userObj = JSON.parse(localStorage.getItem('user') || '{}');
          if (userObj) {
            userObj.settings = userObj.settings || {};
            userObj.settings.theme = mode;
            localStorage.setItem('user', JSON.stringify(userObj));
          }
        } catch (e) { /* ignore */ }
      })
      .catch(() => {});
  }, []);

  const setTheme = useCallback((mode, syncToBackendFlag = true) => {
    const resolvedMode = isValidTheme(mode) ? mode : 'system';
    try {
      localStorage.setItem(STORAGE_KEY, resolvedMode);
    } catch (e) { /* ignore */ }
    setThemeMode(resolvedMode);
    if (syncToBackendFlag) {
      syncToBackend(resolvedMode);
    }
  }, [syncToBackend]);

  return (
    <ThemeContext.Provider value={{ theme: themeMode, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
