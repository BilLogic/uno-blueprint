import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `.claude/worktrees/*` are full checkouts of this repo, each with its own
  // tsconfig. Without this, typescript-eslint finds several candidate roots and
  // fails to parse *every* file with "No tsconfigRootDir was set" — so opening
  // a worktree breaks linting for the main tree.
  globalIgnores(['dist', '.claude/worktrees', 'supabase/functions/uno-tools/server.generated.js']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Underscore-prefixed names are deliberate discards (destructure-and-drop
      // fields, intentionally unused params kept for signature parity).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // The checks are `.mjs`, and until this block nothing read them. A local
    // that is computed and never used is the shape a guard takes when it is
    // wired up half way: `check-database-names.mjs` counted the files it swept
    // into two variables, refused on neither, and reported clean over a tree it
    // had not opened. One rule, the same options as above, because a dead local
    // in a check is the check's subject going missing.
    files: ['**/*.{mjs,js}'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Context modules and these components deliberately co-export their
    // hooks/constants beside the component (the standard shadcn/context-module
    // pattern). Vite HMR still works — it just falls back to a full reload for
    // these modules — so fast-refresh purity is not worth splitting the files.
    files: [
      'src/contexts/**/*.{ts,tsx}',
      'src/components/blueprint/BlueprintArrowMarkerDefs.tsx',
      'src/components/blueprint/PathSummaryTooltip.tsx',
      'src/components/blueprint/PathMultiSelect.tsx',
      'src/components/blueprint/ScenarioBlueprintPanel.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Generated shadcn design-system files export variants and hooks beside
    // their components by design — fast-refresh purity is not our contract
    // to enforce on vendored registry code.
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
