import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { auth, db } from '@myfirebase';
import { getDoc, doc } from 'firebase/firestore';
import {
  GoogleAuthProvider,
  signInWithCredential,
  OAuthProvider,
} from 'firebase/auth';
import appleAuth, { AppleButton } from '@invertase/react-native-apple-authentication';
import googleLogo from '@images/google.png';
import type { Href } from 'expo-router';

WebBrowser.maybeCompleteAuthSession();

export default function OnboardingScreen() {
  const redirectUri = makeRedirectUri({
    native: 'com.googleusercontent.apps.3479738139-818thhekvptt7nrpe04dj7h7f1hvf2fm:/oauthredirect',
  });

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: '3479738139-6h21baha99OlK06lh9tn31erv8klenjn.apps.googleusercontent.com',
    iosClientId: '3479738139-818thhekvptt7nrpe04dj7h7f1hvf2fm.apps.googleusercontent.com',
    webClientId: '3479738139-6h21baha99OlK06lh9tn31erv8klenjn.apps.googleusercontent.com',
    redirectUri,
  });

  useEffect(() => {
    if (response?.type === 'success' && response.authentication?.idToken) {
      const credential = GoogleAuthProvider.credential(response.authentication.idToken);
      signInWithCredential(auth, credential)
        .then(async (userCred) => {
          const user = userCred.user;
          await handlePostLoginRedirect(user.uid);
        })
        .catch(err => {
          console.error('Google Sign-In error:', err);
        });
    }
  }, [response]);

  const handleAppleSignIn = async () => {
    try {
      const appleAuthRequestResponse = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
      });

      const { identityToken, nonce } = appleAuthRequestResponse;
      if (!identityToken) throw new Error('Apple Sign-In failed: No identity token returned.');

      const provider = new OAuthProvider('apple.com');
      const appleCredential = provider.credential({ idToken: identityToken, rawNonce: nonce });

      const userCred = await signInWithCredential(auth, appleCredential);
      const user = userCred.user;
      await handlePostLoginRedirect(user.uid);
    } catch (error) {
      console.error('Apple Sign-In error:', error);
    }
  };

  const handlePostLoginRedirect = async (uid: string) => {
    try {
      const profileRef = doc(db, 'users', uid); // ✅ Fixed path
      const profileSnap = await getDoc(profileRef);

      if (!profileSnap.exists() || !profileSnap.data()?.username) {
        router.replace('/screen/Chooseusername' as Href);
        return;
      }

      const key = `@onboarding_seen_${uid}`;
      const hasSeen = await AsyncStorage.getItem(key);

      if (hasSeen) {
        router.replace('/(tabs)');
      } else {
        router.replace('/screen/Walkthrough' as Href);
      }
    } catch (err) {
      console.error('Post-login redirect error:', err);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to DynastyCalc</Text>

      <Pressable style={styles.googleButton} onPress={() => promptAsync()} disabled={!request}>
        <Image source={googleLogo} style={styles.icon} />
        <Text style={styles.googleText}>Continue with Google</Text>
      </Pressable>

      <AppleButton
        buttonStyle={AppleButton.Style.BLACK}
        buttonType={AppleButton.Type.SIGN_IN}
        style={styles.appleNativeButton}
        onPress={handleAppleSignIn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    marginBottom: 32,
    textAlign: 'center',
  },
  googleButton: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 16,
  },
  googleText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  appleNativeButton: {
    width: '100%',
    height: 44,
  },
  icon: {
    width: 18,
    height: 18,
    marginRight: 12,
    resizeMode: 'contain',
  },
});
