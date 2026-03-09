const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add custom path aliases
config.resolver.alias = {
  ...config.resolver.alias,
  '@screen': './app/screen',
  '@assets': './assets',
  '@components': './components',
  '@constants': './constants',
  '@': './',
  '@hooks': './hooks',
};

// ✅ Fix for Firebase auth initialization issue
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
