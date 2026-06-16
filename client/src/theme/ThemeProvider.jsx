import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

function resolveTheme(mode, prefersDark) {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return prefersDark ? 'dark' : 'light';
}

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeMode] = useState(() => {
    const saved = localStorage.getItem('app-theme') || localStorage.getItem('theme');
    if (saved) {
      if (!localStorage.getItem('app-theme')) {
        localStorage.setItem('app-theme', saved);
      }
      return saved;
    }
    return 'system';
  });

  const applyTheme = useCallback((mode) => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = resolveTheme(mode, prefersDark);
    const isDark = resolved === 'dark';

    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  useEffect(() => {
    applyTheme(themeMode);
  }, [themeMode, applyTheme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (themeMode === 'system') {
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themeMode, applyTheme]);

  const setTheme = useCallback((mode) => {
    localStorage.setItem('app-theme', mode);
    setThemeMode(mode);
  }, []);

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolvedTheme = resolveTheme(themeMode, prefersDark);

  return (
    <ThemeContext.Provider value={{ theme: themeMode, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
