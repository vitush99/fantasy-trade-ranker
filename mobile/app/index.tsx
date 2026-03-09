import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@myfirebase';

export default function Index() {
  const [isLoggedIn, setIsLoggedIn] = useState<null | boolean>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsLoggedIn(!!user);
    });

    return () => unsubscribe();
  }, []);

  if (isLoggedIn === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Redirect href={isLoggedIn ? '/(tabs)' : '/onboarding'} />;
}
