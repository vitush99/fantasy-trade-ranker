export const modal = true;

import React, { ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '@myfirebase';
import { getAuth } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
} from 'firebase/firestore';
import { db } from '@myfirebase';

export default function SettingsScreen() {
  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await GoogleSignin.signOut();
              await AsyncStorage.removeItem('onboarding_complete'); // ✅ Clear onboarding flag
              await auth.signOut();
              router.replace('/onboarding');
            } catch (error) {
              Alert.alert('Error', 'Failed to sign out.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your DynastyCalc account? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const user = getAuth().currentUser;
              if (!user) throw new Error('User not signed in');
  
              // 1️⃣ Delete swipe history
              const swipesRef = collection(db, 'users', user.uid, 'swipes');
              const swipesSnap = await getDocs(swipesRef);
              await Promise.all(swipesSnap.docs.map((docSnap) =>
                deleteDoc(doc(db, 'users', user.uid, 'swipes', docSnap.id))
              ));
  
              // 2️⃣ Delete rankings
              const formats: ('sf' | '1qb')[] = ['sf', '1qb'];
              await Promise.all(formats.map((format) =>
                deleteDoc(doc(db, 'users', user.uid, 'rankings', format))
              ));
  
              // 3️⃣ Delete user document (optional)
              await deleteDoc(doc(db, 'users', user.uid));
  
              // 4️⃣ Delete Firebase Auth account
              await user.delete();
  
              // 5️⃣ Clear local storage
              await AsyncStorage.clear();
  
              // 6️⃣ Navigate to onboarding
              router.replace('/onboarding');
            } catch (err: any) {
              if (err.code === 'auth/requires-recent-login') {
                Alert.alert(
                  'Action Denied',
                  'Please sign out and log back in before deleting your account for security reasons.'
                );
              } else {
                Alert.alert('Error', err.message || 'Failed to delete account.');
              }
            }
          },
        },
      ],
      { cancelable: true }
    );
  };  

  const handleClearHistory = async () => {
    Alert.alert(
      'Clear Swipe History',
      'Are you sure you want to delete your swipe history? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              const user = getAuth().currentUser;
              if (!user) throw new Error('Not signed in');
  
              // 🔥 Delete all swipe docs
              const swipesRef = collection(db, 'users', user.uid, 'swipes');
              const snapshot = await getDocs(swipesRef);
              await Promise.all(snapshot.docs.map((docSnap) =>
                deleteDoc(doc(db, 'users', user.uid, 'swipes', docSnap.id))
              ));
  
              // 🧹 Delete personalized rankings
              await deleteDoc(doc(db, 'users', user.uid, 'rankings', 'sf'));
              await deleteDoc(doc(db, 'users', user.uid, 'rankings', '1qb'));
  
              // 🧼 Clear local cache
              await AsyncStorage.removeItem('@swipe_history');
              await AsyncStorage.removeItem('@personalized_rankings');
              await AsyncStorage.setItem('@rankings_should_refresh', 'true');
  
              Alert.alert('Done', 'Swipe history cleared.');
            } catch (err) {
              Alert.alert('Error', 'Failed to clear history.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Manual Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#007aff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <SettingsSection title="ABOUT">
          <PlainText text="DynastyCalc helps you swipe on trades and get personalized dynasty rankings." />
        </SettingsSection>

        <SettingsSection title="CONTACT">
          <SettingsItem label="📧 fantasy@dynastycalc.com" onPress={() => Linking.openURL('mailto:fantasy@dynastycalc.com')} />
        </SettingsSection>

        <SettingsSection title="LEGAL">
          <SettingsItem label="Privacy Policy" onPress={() => Linking.openURL('https://docs.google.com/document/d/1l5rEmeQ-85aO1PBupyhR_TXjcWE8Hwxc98vJyOiK1aI/edit?usp=sharing')} />
          <SettingsItem label="Support" onPress={() => Linking.openURL('https://docs.google.com/document/d/1bItD21QxJYYKRdGcNlnFYR6lx3iYi9uzgFyXbGUcYl4/edit?usp=sharing')} />
        </SettingsSection>

        <SettingsSection title="SENSITIVE">
          <SettingsItem label="Clear Swipe History" onPress={handleClearHistory} danger />
          <SettingsItem label="Sign Out" onPress={handleSignOut} danger />
          <SettingsItem label="Delete Account" onPress={handleDeleteAccount} danger />
        </SettingsSection>

        <View style={styles.footer}>
          <Text style={styles.footerText}>App version 1.0.0</Text>
          <Text style={styles.footerText}>© 2025 DynastyCalc</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------- Subcomponents with Types ----------

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeader}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function SettingsItem({
  label,
  onPress,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.item}>
      <Text style={[styles.itemText, danger && styles.dangerText]}>{label}</Text>
    </TouchableOpacity>
  );
}

function PlainText({ text }: { text: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.descriptionText}>{text}</Text>
    </View>
  );
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'space-between',
    backgroundColor: '#f8f8f8',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  content: { padding: 16, paddingBottom: 60 },
  section: { marginBottom: 10 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
    paddingHorizontal: 4,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 1,
  },
  item: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  itemText: {
    fontSize: 16,
    color: '#000',
  },
  dangerText: {
    color: 'red',
    fontWeight: '500',
  },
  descriptionText: {
    padding: 16,
    fontSize: 15,
    color: '#333',
    lineHeight: 21,
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
    opacity: 0.5,
  },
  footerText: {
    fontSize: 13,
    color: '#888',
  },
});
