const IS_DEV = process.env.APP_VARIANT === 'development';

export default {
  expo: {
    name: IS_DEV ? 'Syntopico (Dev)' : 'Syntopico',
    slug: 'syntopico',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#FCFAF4',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: IS_DEV ? 'com.nnc.syntopico.dev' : 'com.nnc.syntopico',
      infoPlist: {
        NSMicrophoneUsageDescription:
          'Syntopico uses the microphone to record your spoken reading notes, which are transcribed into text.',
      },
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
    extra: {
      eas: {
        projectId: 'd13aac97-d731-49cf-9f6b-fbc72e2a4de1',
      },
    },
  },
};
