module.exports = {
  env: {
    browser: true,
    es2021: true,
    commonjs: {
      require: true,
    },
    mocha: true,
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
    'no-debugger': 'warn',
  },
  ignorePatterns: [
    'webpack.config.js',
    '.eslintrc.js',
    'i18n.js',
    'WebGazer/',
    'lib/',
    'server.js',
    '.json',
    'test-exec/',
  ],
}
