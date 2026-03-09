import { Slot } from 'expo-router';
import { useEffect } from 'react';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootSiblingParent } from 'react-native-root-siblings';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// ✅ warm global trades cache on app boot
import { useTradesCacheInit } from '@hooks/useTradesCache';

export default function RootLayout() {
  useTradesCacheInit();

  useEffect(() => {
    GoogleSignin.configure({
      iosClientId: '3479738139-818thhekvptt7nrpe04dj7h7f1hvf2fm.apps.googleusercontent.com',
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RootSiblingParent>
          <Slot />
        </RootSiblingParent>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
