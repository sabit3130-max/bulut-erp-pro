import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      'data/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        console: 'readonly',
        document: 'readonly',
        File: 'readonly',
        FormData: 'readonly',
        localStorage: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        window: 'readonly',
        fetch: 'readonly',
        KeyboardEvent: 'readonly',
        setTimeout: 'readonly',
      },
    },
    rules: {
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'warn',
    },
  },
];
