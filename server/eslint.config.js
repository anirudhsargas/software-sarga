
import globals from "globals";
import pluginJs from "@eslint/js";
import prettierConfig from "eslint-config-prettier";

export default [
  {
    languageOptions: {
      globals: {
        ...globals.node,
      }
    }
  },
  {
    files: ["**/__tests__/**/*.js", "**/__mocks__/**/*.js", "**/tests/**/*.js", "**/*.test.js", "**/*.spec.js"],
    languageOptions: {
      globals: {
        ...globals.jest,
      }
    }
  },
  pluginJs.configs.recommended,
  {
    rules: {
      "no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_",
        "destructuredArrayIgnorePattern": "^_"
      }]
    }
  },
  prettierConfig,
];
