import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Onboarding from 'react-native-onboarding-swiper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';

const WalkthroughScreen = () => {
  const router = useRouter();
  const user = getAuth().currentUser;

  const completeOnboarding = async () => {
    if (user?.uid) {
      await AsyncStorage.setItem(`@onboarding_seen_${user.uid}`, 'true');
    }
    router.replace('/');
  };

  return (
    <Onboarding
      onDone={completeOnboarding}
      onSkip={completeOnboarding}
      pages={[
        {
          backgroundColor: '#f9f9f9',
          image: <Image source={require('@images/DynastyCalc_Logo_Large.png')} style={styles.image} />,
          title: 'Welcome to DynastyCalc',
          subtitle: 'Swipe through real dynasty trades. Build personalized rankings based on your instincts.',
        },
        {
          backgroundColor: '#f9f9f9',
          image: <Image source={require('@images/submit_trade_screen.png')} style={styles.image} />,
          title: 'Submit Your Own Trades',
          subtitle: 'Share your trade ideas with the community and see how they vote.',
        },
        {
          backgroundColor: '#f9f9f9',
          image: <Image source={require('@images/scoring_settings_screen.png')} style={styles.image} />,
          title: 'Make It Yours',
          subtitle: 'Customize formats: Superflex, 1QB, PPR, TE Premium and more.',
        },
      ]}
    />
  );
};

const styles = StyleSheet.create({
  image: {
    width: 250,
    height: 250,
    resizeMode: 'contain',
  },
});

export default WalkthroughScreen;
