import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { Colors } from '@constants/Colors';
import { useColorScheme } from '@hooks/useColorScheme';
import TabBarBackground from '@components/ui/TabBarBackground';
import { HapticTab } from '@components/HapticTab';
import { IconSymbol } from '@components/ui/IconSymbol';

export default function TabLayout() {
  return (
    <Tabs
  initialRouteName="index"
  screenOptions={{
    headerShown: false,
    tabBarStyle: {
      backgroundColor: '#fff',
      borderTopWidth: 1,
      borderTopColor: '#ccc',
    },
    tabBarActiveTintColor: '#007aff',
    tabBarInactiveTintColor: '#888',
    tabBarLabelStyle: {
      fontSize: 12,
    },
  }}
>
  <Tabs.Screen
    name="index"
    options={{
      title: 'Swipe',
      tabBarIcon: ({ color }) => (
        <Ionicons name="swap-horizontal-outline" size={22} color={color} />
      ),
    }}
  />
  <Tabs.Screen
    name="trades"
    options={{
      title: 'Trades',
      tabBarIcon: ({ color }) => (
        <Ionicons name="document-text-outline" size={22} color={color} />
      ),
    }}
  />
   <Tabs.Screen
    name="feed"
    options={{
      title: 'Feed',
      tabBarIcon: ({ color }) => (
        <Ionicons name="flame-outline" size={22} color={color} />
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
      title: 'Profile',
      tabBarIcon: ({ color }) => (
        <Ionicons name="person-outline" size={22} color={color} />
      ),
    }}
  />
</Tabs>

  );
}
