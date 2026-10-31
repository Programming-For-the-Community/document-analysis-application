// ESLint 9 flat config (replaces the old .eslintrc.json, which ESLint 9 no longer reads).
//
// eslint-plugin-sonarjs runs the same JS/TS rules SonarQube Cloud applies in CI
// (.github/workflows/sonar_scan.yml), so `npm run lint` surfaces Sonar issues
// locally before they reach the quality gate.
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const sonarjs = require('eslint-plugin-sonarjs');
const reactHooks = require('eslint-plugin-react-hooks');
const jsxA11y = require('eslint-plugin-jsx-a11y');
const prettier = require('eslint-config-prettier');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-electron/**',
      'build/**',
      'renderer/**/*.js',
      'eval/extraction/last-report.json',
      'coverage/**',
      'data/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
        // Type information lets the Sonar rules that need it (e.g. S4325, S6544) run.
        // Both programs are listed because renderer-only helpers under constants/,
        // interfaces/, types/ and utils/renderer/ are only reachable from the renderer one.
        project: ['./tsconfig.json', './renderer/tsconfig.json', './tests/tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
    },
    plugins: { '@typescript-eslint': tseslint, sonarjs, 'react-hooks': reactHooks },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...sonarjs.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      // Sonar S6544 — unhandled promises must be awaited, caught or marked `void`
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    // Sonar's React accessibility rules (S6848, S1082, S6853, S6836…) are jsx-a11y's
    files: ['**/*.tsx'],
    plugins: { 'jsx-a11y': jsxA11y },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // Sonar S6819 — prefer a native <button> etc. over role="button" on a div
      'jsx-a11y/prefer-tag-over-role': 'error',
    },
  },
  {
    // AWS_* is the project's naming convention for the static AWS service wrappers
    // (mirrored as a sonar.issue.ignore rule in ../sonar-project.properties)
    files: ['classes/aws/**/*.ts'],
    rules: { 'sonarjs/class-name': 'off' },
  },
  {
    // Test fixtures use fake credentials and local http:// endpoints by design
    files: ['tests/**/*.ts'],
    rules: {
      // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- the rule's own name
      'sonarjs/no-hardcoded-passwords': 'off',
      'sonarjs/no-clear-text-protocols': 'off',
    },
  },
  {
    // Build/release tooling is plain CommonJS Node
    files: ['scripts/**/*.js', 'eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        __dirname: 'readonly',
        process: 'readonly',
        console: 'readonly',
      },
    },
    plugins: { sonarjs },
    rules: {
      ...sonarjs.configs.recommended.rules,
    },
  },
  prettier,
];
