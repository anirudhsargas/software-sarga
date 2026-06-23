import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dev-dist', '.vercel', 'public/syncWorker.js', 'generate-icons.js']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='style'] ObjectExpression Property > Literal[value=/^#|^rgb|^rgba/i]",
          message: 'Inline colors are disallowed. Please use the global theme.color.* tokens from src/theme/colors.js.',
        },
        {
          selector: "JSXAttribute[name.name='style'] ObjectExpression Property > TemplateLiteral TemplateElement[value.raw=/^#|^rgb|^rgba/i]",
          message: 'Inline colors are disallowed. Please use the global theme.color.* tokens from src/theme/colors.js.',
        }
      ],
    },
  },
])
