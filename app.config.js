const IS_DEV = process.env.APP_VARIANT === 'development';

export default {
  expo: {
    name: IS_DEV ? 'BookBuddy (Dev)' : 'BookBuddy',
    slug: 'bookbuddy',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: IS_DEV ? 'com.nnc.bookbuddy.dev' : 'com.nnc.bookbuddy',
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      '@sentry/react-native/expo',
      'expo-dev-client',
      'expo-audio',
      'expo-sqlite',
      'expo-asset',
      'expo-font',
    ],
    experiments: {
      newArchEnabled: true,
    },
  },
};
