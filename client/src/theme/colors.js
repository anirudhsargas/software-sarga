export const LIGHT = {
  background: 'var(--color-background)',
  surface: 'var(--color-surface)',
  surfaceSecondary: 'var(--color-surfaceSecondary)',
  surfaceHover: 'var(--color-surfaceHover)',
  card: 'var(--color-surface)',
  border: 'var(--color-border)',
  divider: 'var(--color-surfaceHover)',
  text: 'var(--color-text)',
  textSecondary: 'var(--color-textSecondary)',
  textMuted: 'var(--color-textMuted)',
  primary: 'var(--color-primary)',
  primaryHover: 'var(--color-primaryHover)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  info: 'var(--color-info)',
  input: 'var(--color-surface)',
  inputBorder: 'var(--color-border)',
  inputFocus: 'var(--color-primary)',
  sidebar: 'var(--color-surface)',
  header: 'var(--color-surface)',
  tableHeader: 'var(--color-background)',
  tableRow: 'var(--color-surface)',
  overlay: 'var(--color-text)',
  shadow: 'var(--color-shadow)',
  icon: 'var(--color-icon)',
  disabled: 'var(--color-disabled)'
};

export const DARK = {
  background: 'var(--color-text)',
  surface: 'var(--color-text)',
  surfaceSecondary: 'var(--color-text)',
  surfaceHover: 'var(--color-textSecondary)',
  card: 'var(--color-text)',
  border: 'var(--color-textSecondary)',
  divider: 'var(--color-icon)',
  text: 'var(--color-background)',
  textSecondary: 'var(--color-border)',
  textMuted: 'var(--color-disabled)',
  primary: 'var(--color-info)',
  primaryHover: 'var(--color-info)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  info: 'var(--color-info)',
  input: 'var(--color-text)',
  inputBorder: 'var(--color-icon)',
  inputFocus: 'var(--color-info)',
  sidebar: 'var(--color-shadow)',
  header: 'var(--color-text)',
  tableHeader: 'var(--color-text)',
  tableRow: 'var(--color-text)',
  overlay: 'var(--color-shadow)',
  shadow: 'var(--color-shadow)',
  icon: 'var(--color-border)',
  disabled: 'var(--color-icon)'
};

// Expose theme object that maps to CSS variables for use in inline styles
export const theme = {
  color: Object.keys(LIGHT).reduce((acc, key) => {
    acc[key] = `var(--color-${key})`;
    return acc;
  }, {})
};
