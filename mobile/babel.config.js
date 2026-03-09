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
            '@components': './components',
            '@constants': './constants',
            '@hooks': './hooks',
            '@auth': './auth',
            '@engine': './ranking_engine.ts',
            '@myfirebase': './firebase/index.ts',
            '@myfirebaseConfig': './firebaseConfig.ts',
            '@utils': './utils', 
            '@data': './app/data', 
            '@appTypes': './types',
          },
        },
      ],
      'react-native-reanimated/plugin', 
    ],
  };
};
