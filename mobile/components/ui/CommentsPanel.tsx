import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
} from 'react-native';
import Animated, {
  SlideInRight,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { getAuth } from 'firebase/auth';
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '@myfirebase';
import { KeyboardAwareFlatList } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
  tradeId?: string;
}

export default function CommentsPanel({ visible, onClose, tradeId }: Props) {
  const [input, setInput] = useState('');
  const [comments, setComments] = useState<any[]>([]);
  const [trade, setTrade] = useState<any>(null);
  const flatListRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const translateX = useSharedValue(0);

  let shouldHandlePan = true;

  const panGesture = Gesture.Pan()
    .onBegin((event) => {
      shouldHandlePan = event.x <= 30;
    })
    .onUpdate((event) => {
      if (shouldHandlePan && event.translationX > 0) {
        translateX.value = event.translationX;
      }
    })
    .onEnd((event) => {
      if (!shouldHandlePan) return;

      if (event.translationX > 100) {
        translateX.value = withTiming(width, { duration: 300 }, (finished) => {
          if (finished) {
            runOnJS(onClose)();
          }
        });
      } else {
        translateX.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  useEffect(() => {
    if (visible) {
      translateX.value = 0;
    }
  }, [visible]);

  useEffect(() => {
    if (!tradeId || !visible) return;

    const commentsRef = collection(db, 'trades', tradeId, 'comments');
    const q = query(commentsRef, orderBy('timestamp'));
    const unsub = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setComments(items);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    return () => unsub();
  }, [tradeId, visible]);

  useEffect(() => {
    const fetchTrade = async () => {
      if (!tradeId) return;
      const tradeRef = doc(db, 'trades', tradeId);
      const tradeSnap = await getDoc(tradeRef);
      if (tradeSnap.exists()) {
        setTrade(tradeSnap.data());
      }
    };
    if (visible) {
      fetchTrade();
    }
  }, [tradeId, visible]);

  const sendComment = async () => {
    const user = getAuth().currentUser;
    if (!user || !input.trim()) return;

    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      const username = userSnap.exists() ? userSnap.data().username : 'Anonymous';

      const comment = {
        text: input.trim(),
        userId: user.uid,
        displayName: username,
        timestamp: serverTimestamp(),
      };

      setInput('');
      await addDoc(collection(db, 'trades', tradeId!, 'comments'), comment);
    } catch (err) {
      console.warn('❌ Failed to send comment:', err);
    }
  };

  if (!visible) return null;

  return (
    <>
      <View style={styles.backdrop} />
      <GestureDetector gesture={panGesture}>
        <Animated.View
          entering={SlideInRight.duration(400)}
          style={[styles.panel, { paddingTop: insets.top }, animatedStyle]}
        >
          <View style={styles.flex}>
            <View style={styles.navHeader}>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.backArrow}>←</Text>
              </TouchableOpacity>
              <Text style={styles.navTitle}>Trade</Text>
              <View style={{ width: 24 }} />
            </View>

            {trade && (
              <View style={styles.tradeInfo}>
                <View style={styles.row}>
                  <View style={styles.column}>
                    <Text style={styles.label}>Receiving</Text>
                    {trade.sideA.map((player: string, idx: number) => (
                      <Text style={styles.player} key={`a-${idx}`}>{player}</Text>
                    ))}
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.column}>
                    <Text style={styles.label}>Sending</Text>
                    {trade.sideB.map((player: string, idx: number) => (
                      <Text style={styles.player} key={`b-${idx}`}>{player}</Text>
                    ))}
                  </View>
                </View>
                <Text style={styles.settings}>
                  {trade.settings.qb} | {trade.settings.te} | {trade.settings.teams} Teams | Start {trade.settings.start} | {trade.settings.passTD}pt PassTD | {trade.settings.ppr} PPR
                </Text>
              </View>
            )}

            <Text style={styles.commentsHeader}>Comments</Text>

            <KeyboardAwareFlatList
              ref={flatListRef}
              data={comments}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.flatListContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              extraScrollHeight={300}
              enableOnAndroid={true}
              style={styles.flex}
              renderItem={({ item }) => (
                <View style={styles.commentBubble}>
                  <Text style={styles.author}>{item.displayName}</Text>
                  <Text style={styles.text}>{item.text}</Text>
                </View>
              )}
            />

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={insets.top}
            >
              <View style={styles.inputContainer}>
                <TextInput
                  placeholder="Write a comment..."
                  placeholderTextColor="#888"
                  value={input}
                  onChangeText={setInput}
                  style={styles.input}
                  onSubmitEditing={sendComment}
                  returnKeyType="send"
                />
                <TouchableOpacity onPress={sendComment}>
                  <Text style={styles.send}>➤</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Animated.View>
      </GestureDetector>
    </>
  );
}


const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 6,
    flexDirection: 'column',
  },
  flex: {
    flex: 1,
  },
  navHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
  },
  backArrow: {
    fontSize: 20,
    color: '#555',
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  tradeInfo: {
    padding: 16,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  column: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    backgroundColor: '#ccc',
    marginHorizontal: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  player: {
    fontSize: 16,
    marginBottom: 4,
  },
  settings: {
    textAlign: 'center',
    marginTop: 8,
    color: '#666',
    fontSize: 14,
  },
  commentsHeader: {
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    color: '#444',
  },
  commentBubble: {
    backgroundColor: '#f1f1f1',
    borderRadius: 10,
    padding: 12,
    marginVertical: 6,
  },
  author: {
    fontWeight: '600',
    marginBottom: 4,
    color: '#333',
  },
  text: {
    fontSize: 14,
    color: '#222',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: '#f1f1f1',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
  },
  send: {
    fontSize: 22,
    marginLeft: 10,
    color: '#007aff',
  },
  flatListContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
});
