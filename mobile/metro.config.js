const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.alias = {
  ...config.resolver.alias,
  '@screen': './app/screen',
  '@assets': './assets',
  '@components': './components',
  '@constants': './constants',
  '@': './',
  '@hooks': './hooks',
};

module.exports = config;