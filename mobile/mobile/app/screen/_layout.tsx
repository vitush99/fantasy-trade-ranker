import { Stack } from 'expo-router';

export default function ScreenLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // 👈 FULLY HIDE the default header
      }}
    />
  );
}
