import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'dev-dist/**/*', 'node_modules/**/*', 'supabase/**/*'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
