import React from 'react';
import { View, TextInput, ActivityIndicator, FlatList, Text, TouchableOpacity, Image } from 'react-native';
import { searchUsersPrefix } from '@utils/social';
import FollowButton from './FollowButton';

export default function SearchHeader({ myFollowingIds }:{ myFollowingIds: Set<string> }) {
  const [q, setQ] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<any[]>([]);

  React.useEffect(() => {
    const id = setTimeout(async () => {
      if (!q.trim()) { setResults([]); return; }
      setLoading(true);
      try { setResults(await searchUsersPrefix(q.trim(), 20)); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <View style={{ padding: 12, backgroundColor: '#fff' }}>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search users by username or name"
        placeholderTextColor="#9aa4b2"
        style={{
          height: 40, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb',
          paddingHorizontal: 12, backgroundColor: '#f9fafb'
        }}
      />
      {loading ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
      {q.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.uid}
          style={{ maxHeight: 280, marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: '#eee' }}
          renderItem={({ item }) => (
            <View style={{ padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Image source={{ uri: item.photoURL || undefined }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#e5e7eb' }} />
                <View>
                  <Text style={{ fontWeight: '600' }}>{item.displayName || item.username}</Text>
                  <Text style={{ color: '#6b7280' }}>@{item.username}</Text>
                </View>
              </View>
              <FollowButton initial={myFollowingIds.has(item.uid)} targetUid={item.uid} />
            </View>
          )}
        />
      )}
    </View>
  );
}
