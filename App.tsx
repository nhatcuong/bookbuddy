import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import {
  useFonts,
  Newsreader_400Regular,
  Newsreader_500Medium,
  Newsreader_600SemiBold,
  Newsreader_400Regular_Italic,
  Newsreader_500Medium_Italic,
  Newsreader_600SemiBold_Italic,
} from '@expo-google-fonts/newsreader';
import { initDatabase } from './src/db/database';
import HomeScreen from './src/screens/HomeScreen';
import BookScreen from './src/screens/BookScreen';
import { RootStackParamList } from './src/navigation/types';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: process.env.APP_VARIANT !== 'development',
});

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [fontsLoaded] = useFonts({
    Newsreader_400Regular,
    Newsreader_500Medium,
    Newsreader_600SemiBold,
    Newsreader_400Regular_Italic,
    Newsreader_500Medium_Italic,
    Newsreader_600SemiBold_Italic,
  });

  useEffect(() => {
    initDatabase();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Book" component={BookScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
