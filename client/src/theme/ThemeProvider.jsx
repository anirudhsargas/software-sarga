import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import api from '../services/api';

const ThemeContext = createContext();
export const useTheme = () => useContext(ThemeContext);

const VALID_MODES = ['light', 'dark', 'system'];
const STORAGE_KEY = 'app-theme';
const THEME_ATTRIBUTE = 'data-theme';

function getSystemPref() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function resolveTheme(mode, prefersDark) {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return prefersDark ? 'dark' : 'light';
}

function isValidTheme(mode) {
  return VALID_MODES.includes(mode);
}

function applyThemeToDOM(mode) {
  const prefersDark = getSystemPref();
  const resolved = resolveTheme(mode, prefersDark);
  const isDark = resolved === 'dark';
  document.documentElement.setAttribute(THEME_ATTRIBUTE, resolved);
  document.documentElement.classList.toggle('dark', isDark);
}

function loadPersistedTheme() {
  let saved = localStorage.getItem(STORAGE_KEY);

  if (!saved || !isValidTheme(saved)) {
    try {
      const userObj = JSON.parse(localStorage.getItem('user') || '{}');
      saved = userObj?.settings?.theme;
    } catch (e) {}
  }

  if (saved && isValidTheme(saved)) {
    if (localStorage.getItem(STORAGE_KEY) !== saved) {
      localStorage.setItem(STORAGE_KEY, saved);
    }
    return saved;
  }

  localStorage.setItem(STORAGE_KEY, 'system');
  return 'system';
}

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeMode] = useState(loadPersistedTheme);
  const mqListenerRef = useRef(null);
  const appliedRef = useRef(false);

  const applyTheme = useCallback((mode) => {
    applyThemeToDOM(mode);
    appliedRef.current = true;
  }, []);

  const setupSystemListener = useCallback((mode) => {
    if (mqListenerRef.current) {
      try {
        window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', mqListenerRef.current);
      } catch (e) {}
      mqListenerRef.current = null;
    }

    if (mode === 'system') {
      const handler = () => {
        applyTheme('system');
      };
      mqListenerRef.current = handler;
      try {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', handler);
      } catch (e) {
        try {
          window.matchMedia('(prefers-color-scheme: dark)').addListener(handler);
        } catch (_) {}
      }
    }
  }, [applyTheme]);

  const syncToBackend = useCallback((mode) => {
    const token = localStorage.getItem('token');
    if (!token) return;

    api.patch('/staff/settings', { settings: { theme: mode } })
      .then(res => {
        try {
          const userObj = JSON.parse(localStorage.getItem('user') || '{}');
          if (userObj) {
            userObj.settings = userObj.settings || {};
            userObj.settings.theme = mode;
            localStorage.setItem('user', JSON.stringify(userObj));
          }
        } catch (e) {}
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    applyTheme(themeMode);
    setupSystemListener(themeMode);
  }, [themeMode, applyTheme, setupSystemListener]);

  const setTheme = useCallback((mode, syncToBackendFlag = true) => {
    const resolvedMode = isValidTheme(mode) ? mode : 'system';
    localStorage.setItem(STORAGE_KEY, resolvedMode);
    setThemeMode(resolvedMode);
    if (syncToBackendFlag) {
      syncToBackend(resolvedMode);
    }
  }, [syncToBackend]);

  const prefersDark = getSystemPref();
  const resolvedTheme = resolveTheme(themeMode, prefersDark);

  return (
    <ThemeContext.Provider value={{ theme: themeMode, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
