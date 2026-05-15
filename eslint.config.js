// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Matches CLAUDE.md rule: "No `any`"
      '@typescript-eslint/no-explicit-any': 'error',
      // Allow omitting the binding in catch when the value isn't used
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_?' }],
      // Generated hook content is a string — suppress the no-useless-escape noise
      'no-useless-escape': 'off',
    },
  },
  {
    // Ignore compiled output and config files
    ignores: ['dist/**', 'node_modules/**', 'vite.config.*.ts'],
  },
);
