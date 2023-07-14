module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'google',
  ],
  rules: {
    'quotes': ['error', 'single'],
    'object-curly-spacing': ['error', 'always'],
    'max-len': ['error', 120],
  },
};
