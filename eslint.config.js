// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  globalIgnores(['dist/*', 'android/*', 'ios/*', 'supabase/functions/*', 'scripts/data/*']),
  expoConfig,
  {
    rules: {
      // Web-only: React Native <Text> renders ' and " as-is, there is no HTML to escape.
      'react/no-unescaped-entities': 'off',
      // Most hits are load-on-mount effects (set loading → fetch), which React
      // still endorses. Kept as a warning so new prop→state syncing gets
      // noticed; use src/lib/useSyncedState for that instead.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // One-off Node scripts and config files run outside the app bundle.
    files: ['scripts/**/*.js', '*.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: { __dirname: 'readonly', require: 'readonly', module: 'writable', process: 'readonly', console: 'readonly' } },
  },
]);
