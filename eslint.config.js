import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist', 'coverage', 'node_modules', 'playtest'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // src/core is the deterministic simulation: no rendering, no browser, no wall clock.
    // Keeping it pure is what makes driving and race rules unit-testable, replayable and server-runnable.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'src/core must not depend on the renderer.' },
            { group: ['**/game/**'], message: 'src/core must not import from src/game.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'navigator', 'performance', 'requestAnimationFrame'].map(
          (name) => ({ name, message: 'src/core must not touch browser APIs.' }),
        ),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Pass a seeded RNG into core instead.' },
        { object: 'Date', property: 'now', message: 'Core takes dt as input; no wall clock.' },
      ],
    },
  },
  {
    // Node scripts are plain JavaScript outside the TypeScript project.
    files: ['scripts/**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  prettier,
);
