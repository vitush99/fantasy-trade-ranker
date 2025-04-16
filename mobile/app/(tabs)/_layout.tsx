import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { Colors } from '@constants/Colors';
import { useColorScheme } from '@hooks/useColorScheme';
import TabBarBackground from '@components/ui/TabBarBackground';
import { HapticTab } from '@components/HapticTab';
import { IconSymbol } from '@components/ui/IconSymbol';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            position: 'absolute',
            borderTopWidth: 0,
            backgroundColor: 'transparent',
          },
          android: {
            backgroundColor: 'black',
          },
        }),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <Ionicons name="home-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="swipe"
        options={{
          title: 'Swipe',
          tabBarIcon: ({ color }) => (
            <Ionicons name="swap-horizontal-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="rankings"
        options={{
          title: 'Rankings',
          tabBarIcon: ({ color }) => (
            <Ionicons name="list-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="swipe-history"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => (
            <Ionicons name="time-outline" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
