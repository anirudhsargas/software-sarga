/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
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

function applyThemeToDOM(resolvedTheme, transition = false) {
  if (typeof document !== 'undefined') {
    const isDark = resolvedTheme === 'dark';
    
    if (transition) {
      document.documentElement.classList.add('theme-transitioning');
    }
    
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

    if (transition) {
      setTimeout(() => {
        document.documentElement.classList.remove('theme-transitioning');
      }, 250);
    }
  }
}

function loadPersistedTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {  }

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
  } catch {  }

  // If no saved value → create "system"
  try {
    localStorage.setItem(STORAGE_KEY, 'system');
  } catch {  }
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
    } catch {  }
  }, []);

  // Compute resolved theme
  const resolvedTheme = themeMode === 'system' ? systemPref : themeMode;

  const isFirstRender = useRef(true);

  // Apply resolved theme whenever it changes
  useEffect(() => {
    applyThemeToDOM(resolvedTheme, !isFirstRender.current);
    if (isFirstRender.current) {
      isFirstRender.current = false;
    }
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
        } catch {  }
      })
      .catch(() => {});
  }, []);

  const setTheme = useCallback((mode, syncToBackendFlag = true) => {
    const resolvedMode = isValidTheme(mode) ? mode : 'system';
    try {
      localStorage.setItem(STORAGE_KEY, resolvedMode);
    } catch {  }
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
