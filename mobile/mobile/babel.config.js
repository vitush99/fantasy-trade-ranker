module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            '@': './app',
            '@screen': './app/screen',
            '@assets': './assets',
            '@engine': './ranking_engine.ts',
            '@components': './components',
            '@constants': './constants',
            '@hooks': './hooks',
          },
        },
      ],
    ],
  };
};
