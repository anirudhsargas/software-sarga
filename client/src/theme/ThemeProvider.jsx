import React, { createContext, useContext, useEffect, useState } from 'react';
import { LIGHT, DARK } from './colors';

const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeMode] = useState(() => {
    return localStorage.getItem('theme') || 'system';
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const applyTheme = (mode) => {
      let isDark = mode === 'dark';
      if (mode === 'system') {
        isDark = mediaQuery.matches;
      }

      // Set data-theme attribute
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      
      // Inject CSS variables
      const activeColors = isDark ? DARK : LIGHT;
      const root = document.documentElement;
      
      Object.entries(activeColors).forEach(([key, value]) => {
        root.style.setProperty(`--color-${key}`, value);
      });
      
      // For backwards compatibility during transition, set old variables too
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme(themeMode);

    const handleChange = (e) => {
      if (themeMode === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themeMode]);

  const setTheme = (mode) => {
    localStorage.setItem('theme', mode);
    setThemeMode(mode);
  };

  return (
    <ThemeContext.Provider value={{ theme: themeMode, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
