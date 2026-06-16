export const LIGHT = {
  background: 'var(--bg)',
  surface: 'var(--surface)',
  surfaceSecondary: 'var(--surface-2)',
  surfaceHover: 'var(--surface-2)',
  card: 'var(--card-bg)',
  border: 'var(--border)',
  divider: 'var(--border-subtle)',
  text: 'var(--text)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  primary: 'var(--primary)',
  primaryHover: 'var(--accent-2)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--error)',
  info: 'var(--accent)',
  input: 'var(--input-bg)',
  inputBorder: 'var(--input-border)',
  inputFocus: 'var(--primary)',
  sidebar: 'var(--sidebar-bg)',
  header: 'var(--surface)',
  tableHeader: 'var(--table-header-bg)',
  tableRow: 'var(--surface)',
  overlay: 'var(--modal-overlay)',
  shadow: 'var(--shadow-sm)',
  icon: 'var(--icon-color)',
  disabled: 'var(--text-disabled)'
};

// Map dark mode identical to light mode keys, since CSS variables handle the actual values
export const DARK = { ...LIGHT };

// Expose theme object that maps to CSS variables for use in inline styles
export const theme = {
  color: Object.keys(LIGHT).reduce((acc, key) => {
    acc[key] = `var(--color-${key})`;
    return acc;
  }, {})
};
