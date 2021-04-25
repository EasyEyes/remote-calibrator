module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  rules: {
    semi: ['off', 'always'],
    'no-unused-vars': [
      'warn',
      { vars: 'all', args: 'after-used', ignoreRestSiblings: false },
    ],
    eqeqeq: ['warn', 'always'],
  },
  ignorePatterns: [
    'webpack.config.js',
    '.eslintrc.js',
    'WebGazer/',
    'lib/',
    'server.js',
    'serverHTTPS.js',
  ],
}
