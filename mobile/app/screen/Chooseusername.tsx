import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { auth, db } from '@myfirebase';
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';

export default function ChooseUsernameScreen() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    const cleanUsername = username.replace(/\s/g, '').toLowerCase();
    console.log('📛 Cleaned username:', cleanUsername);

    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      Alert.alert('Invalid username', 'Use 3–20 lowercase letters, numbers, or underscores.');
      return;
    }

    setLoading(true);
    try {
      const usernameRef = doc(db, 'usernames', cleanUsername);

      const usernameSnap = await getDoc(usernameRef);

      if (usernameSnap.exists()) {
        Alert.alert('Username taken', 'Please choose another one.');
        return;
      }

      const user = auth.currentUser;
      if (!user) throw new Error('User not found');

      // 🔐 Firestore setDoc to claim username
      await setDoc(doc(db, 'usernames', cleanUsername), {
        uid: user.uid, // ✅ use `user`, not auth.currentUser again
      });

      const userProfileRef = doc(db, 'users', user.uid);
      await setDoc(
        userProfileRef,
        {
          username: cleanUsername,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );


      const key = `@onboarding_seen_${user.uid}`;
      const hasSeen = await AsyncStorage.getItem(key);

      if (hasSeen) {
        router.replace('/(tabs)');
      } else {
        router.replace('/screen/Walkthrough' as Href);
      }
    } catch (err: any) {
      console.error('🔴 Caught error:', err);
      Alert.alert('Something went wrong', err.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const cleanUsername = username.replace(/\s/g, '').toLowerCase();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose Your Username</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter username"
        placeholderTextColor="#888"
        value={username}
        autoCapitalize="none"
        onChangeText={setUsername}
        autoFocus
        returnKeyType="done"
      />
      <TouchableOpacity
        style={styles.button}
        onPress={handleSubmit}
        disabled={loading || cleanUsername.length < 3}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Submit</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#1f7033',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
