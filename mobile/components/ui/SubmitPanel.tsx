import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  SafeAreaView,
  Pressable,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { db, auth } from '@myfirebase';
import { doc, setDoc } from 'firebase/firestore';
import { fetchRankings } from '@/data/dataloader';
import { Colors } from '@constants/Colors';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Switch } from 'react-native';
import Toast from 'react-native-toast-message';

const chips = {
  qb: ['SF', '1QB'],
  te: ['none', 'TE+', 'TE++', 'TE+++'],
  ppr: [0, 0.5, 1, 'Tiered'],
  passTD: [4, 5, 6],
  start: [8, 9, 10, 11, 12],
  teams: [8, 10, 12, 14, 16],
};

type Player = {
  name: string;
  position: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
};

const screenHeight = Dimensions.get('window').height;

export default function SubmitPanel({ visible, onClose }: Props) {
  const router = useRouter();
  const [shouldRender, setShouldRender] = useState(visible);
  const translateY = useSharedValue(screenHeight);
  const backdropOpacity = useSharedValue(0);

  const [players, setPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [sideA, setSideA] = useState<string[]>([]);
  const [sideB, setSideB] = useState<string[]>([]);
  const [addingTo, setAddingTo] = useState<'A' | 'B'>('A');
  const [showSettings, setShowSettings] = useState(true);

  const [settings, setSettings] = useState({
    qb: 'SF',
    te: 'none',
    teams: 12,
    start: 10,
    ppr: 1,
    passTD: 6,
  });

  const summary = `${settings.qb} • TE: ${settings.te} • PPR: ${settings.ppr} • ${settings.passTD}pt Pass TD • ${settings.start} Starters • ${settings.teams} Teams`;

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      translateY.value = withTiming(screenHeight * 0.1, { duration: 400 });
      backdropOpacity.value = withTiming(0.5, { duration: 400 });
    } else {
      translateY.value = withTiming(screenHeight, { duration: 300 });
      backdropOpacity.value = withTiming(0, { duration: 300 });
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [visible]);

  useEffect(() => {
    const loadPlayers = async () => {
      const data = await fetchRankings('sf');
      setPlayers(data);
    };
    loadPlayers();
  }, []);

  useEffect(() => {
    const filtered = players.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase())
    );
    setSearchResults(filtered.slice(0, 10));
  }, [search, players]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const handleChipSelect = (key: keyof typeof settings, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleAddPlayer = (player: Player) => {
    if (sideA.includes(player.name) || sideB.includes(player.name)) return;
    if (addingTo === 'A') setSideA((prev) => [...prev, player.name]);
    else setSideB((prev) => [...prev, player.name]);
    setSearch('');
  };

  const generateTradeHash = (
    sideA: string[],
    sideB: string[],
    settings: object
  ): string => {
    const raw = JSON.stringify({
      sideA: [...sideA].sort(),
      sideB: [...sideB].sort(),
      settings,
    });
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  };

  const handleSubmit = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return Alert.alert('Not signed in', 'Please sign in to submit a trade.');
    if (!sideA.length || !sideB.length) {
      return Alert.alert(
        'Add players to both sides',
        'Please add at least one player to both “Receiving” and “Sending” before submitting.'
      );
    }

    const tradeId = generateTradeHash(sideA, sideB, settings);
    const timestamp = new Date();

    const tradeData = {
      id: tradeId,
      sideA,
      sideB,
      settings,
      submittedBy: uid,
      timestamp,
      isUserSubmission: true,
    };

    try {
      await setDoc(doc(db, 'trades', tradeId), tradeData);
      await setDoc(doc(db, 'tradeVotes', tradeId), { sideA: 0, sideB: 0 });
      await setDoc(doc(db, 'users', uid, 'myTrades', tradeId), {
        tradeId,
        timestamp,
      });

      // Clear the form after successful submission
      setSideA([]);
      setSideB([]);
      setSearch('');
      setSettings({
        qb: 'SF',
        te: 'none',
        teams: 12,
        start: 10,
        ppr: 1,
        passTD: 6,
      });

      onClose(); // close panel
    } catch (error: any) {
      Alert.alert('Error submitting trade', 'Something went wrong. Please try again.');
    }
  };

  if (!shouldRender) return null;

  return (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View style={[styles.backdrop, backdropStyle]} />
      </Pressable>

      <Animated.View style={[styles.panel, panelStyle]}>
        <SafeAreaView style={styles.safeArea}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.container, { paddingBottom: 100 }]}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityLabel="Close submit panel">
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.header}>Submit a Trade</Text>

            {/* Receiving */}
            <View style={{ marginBottom: 2 }}>
              <Text style={styles.sectionHeader}>Receiving</Text>
              <TextInput
                style={[styles.input, { marginTop: -5, marginBottom: 6 }]}
                placeholder="Add a player..."
                placeholderTextColor="#888"
                value={addingTo === 'A' ? search : ''}
                onChangeText={(text) => {
                  setAddingTo('A');
                  setSearch(text);
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {addingTo === 'A' && search.length > 0 && (
                <View>
                  {searchResults.map((item, i) => (
                    <TouchableOpacity
                      key={`${item.name}-${i}`}
                      onPress={() => handleAddPlayer(item)}
                      style={styles.resultItem}
                    >
                      <Text>{item.name} ({item.position})</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <View style={styles.side}>
                {sideA.map((name, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.playerPill}
                    onPress={() =>
                      setSideA((prev) => prev.filter((n) => n !== name))
                    }
                  >
                    <Text style={styles.playerPillText}>{name} ✕</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Sending */}
            <View style={{ marginBottom: 2 }}>
              <Text style={styles.sectionHeader}>Sending</Text>
              <TextInput
                style={[styles.input, { marginTop: -5, marginBottom: 6 }]}
                placeholder="Add a player..."
                placeholderTextColor="#888"
                value={addingTo === 'B' ? search : ''}
                onChangeText={(text) => {
                  setAddingTo('B');
                  setSearch(text);
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {addingTo === 'B' && search.length > 0 && (
                <View>
                  {searchResults.map((item, i) => (
                    <TouchableOpacity
                      key={`${item.name}-${i}`}
                      onPress={() => handleAddPlayer(item)}
                      style={styles.resultItem}
                    >
                      <Text>{item.name} ({item.position})</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <View style={styles.side}>
                {sideB.map((name, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.playerPill}
                    onPress={() =>
                      setSideB((prev) => prev.filter((n) => n !== name))
                    }
                  >
                    <Text style={styles.playerPillText}>{name} ✕</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Scoring settings */}
            <Pressable onPress={() => setShowSettings(!showSettings)}>
              <Text style={styles.sectionHeader}>
                {showSettings ? 'Hide Scoring Settings' : 'Show Scoring Settings'}
              </Text>
            </Pressable>

            {!showSettings && (
              <Text style={styles.summaryText}>{summary}</Text>
            )}

            {showSettings && (
              <>
                {/* 1. PPR */}
                <View style={[styles.chipGroup, { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 }]}>
                  <Text style={styles.chipLabel}>PPR</Text>
                  {chips.ppr.map((v) => (
                    <TouchableOpacity
                      key={v.toString()}
                      style={[
                        styles.chip,
                        settings.ppr === v && styles.chipSelected,
                      ]}
                      onPress={() => handleChipSelect('ppr', v)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          settings.ppr === v && styles.chipTextSelected,
                        ]}
                      >
                        {v}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 2. Teams */}
                <View style={[styles.chipGroup, { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 }]}>
                  <Text style={styles.chipLabel}>Teams</Text>
                  {chips.teams.map((v) => (
                    <TouchableOpacity
                      key={v.toString()}
                      style={[
                        styles.chip,
                        settings.teams === v && styles.chipSelected,
                      ]}
                      onPress={() => handleChipSelect('teams', v)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          settings.teams === v && styles.chipTextSelected,
                        ]}
                      >
                        {v}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 3. Starters */}
                <View style={[styles.chipGroup, { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 }]}>
                  <Text style={styles.chipLabel}>Starters</Text>
                  {chips.start.map((v) => (
                    <TouchableOpacity
                      key={v.toString()}
                      style={[
                        styles.chip,
                        settings.start === v && styles.chipSelected,
                      ]}
                      onPress={() => handleChipSelect('start', v)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          settings.start === v && styles.chipTextSelected,
                        ]}
                      >
                        {v}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 4. Superflex */}
                <View style={[styles.chipGroup, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                  <Text style={styles.chipLabel}>Superflex</Text>
                  <Switch
                    value={settings.qb === 'SF'}
                    onValueChange={(value) =>
                      handleChipSelect('qb', value ? 'SF' : '1QB')
                    }
                    trackColor={{ false: '#ddd', true: '#d1e7ff' }}
                    thumbColor={settings.qb === 'SF' ? '#0077ff' : '#999'}
                  />
                </View>

                {/* 5. Pass TD */}
                <View style={[styles.chipGroup, { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 }]}>
                  <Text style={styles.chipLabel}>Pass TD</Text>
                  {chips.passTD.map((v) => (
                    <TouchableOpacity
                      key={v.toString()}
                      style={[
                        styles.chip,
                        settings.passTD === v && styles.chipSelected,
                      ]}
                      onPress={() => handleChipSelect('passTD', v)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          settings.passTD === v && styles.chipTextSelected,
                        ]}
                      >
                        {v}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 6. TE Premium */}
                <View style={[styles.chipGroup, { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 2 }]}>
                  <Text style={styles.chipLabel}>TE Premium</Text>
                  {chips.te.map((v) => (
                    <TouchableOpacity
                      key={v.toString()}
                      style={[
                        styles.chip,
                        settings.te === v && styles.chipSelected,
                      ]}
                      onPress={() => handleChipSelect('te', v)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          settings.te === v && styles.chipTextSelected,
                        ]}
                      >
                        {v}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
              <Text style={styles.submitText}>Submit This Trade</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'black',
  },
  panel: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    zIndex: 9999,
    elevation: 9999,
  },
  safeArea: { flex: 1 },
  container: { padding: 16 },

  closeButton: {
    position: 'absolute',
    top: 16, right: 16,
    zIndex: 10,
    backgroundColor: Colors.lightGray,
    borderRadius: 16,
    width: 32, height: 32,
    justifyContent: 'center', alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },

  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },

  // Tweaked text sizing / spacing
  sectionHeader: { fontSize: 16, fontWeight: '600', marginVertical: 10, letterSpacing: 0.3 },
  summaryText: { marginBottom: 8, color: '#666', fontSize: 13, fontStyle: 'italic' },

  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  chipLabel: { marginRight: 8, fontWeight: 'bold', fontSize: 13 },

  chip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    margin: 4,
    backgroundColor: '#eee',
  },
  chipSelected: {
    backgroundColor: '#d1e7ff',
    borderColor: '#0077ff',
  },
  chipText: { fontSize: 14, color: '#333' },
  chipTextSelected: { fontWeight: 'bold', color: '#0056b3' },

  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    marginVertical: 12,
    borderRadius: 12,
    fontSize: 16,
    paddingHorizontal: 12,
  },
  resultItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },

  sideContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, gap: 20 },
  side: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sideTitle: { fontWeight: 'bold', fontSize: 16, marginBottom: 8, width: '100%' },

  playerPill: {
    backgroundColor: Colors.lightGray,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    maxWidth: '90%',
  },
  playerPillText: { color: Colors.text },

  addToToggle: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 12 },
  addSide: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderRadius: 16, borderColor: Colors.gray,
  },
  addSideActive: { backgroundColor: Colors.chip.background, borderColor: Colors.primary },

  submitButton: {
    marginTop: 24,
    backgroundColor: Colors.button.green,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitText: { color: Colors.button.greenText, fontWeight: 'bold', fontSize: 16, letterSpacing: 0.2 },
});
