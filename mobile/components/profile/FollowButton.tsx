import React, { useState } from 'react';
import { TouchableOpacity, View, Text, ActivityIndicator } from 'react-native';
import { followUser, unfollowUser } from '@utils/social';

export default function FollowButton({
  targetUid,
  initial = false,
}: { targetUid: string; initial?: boolean }) {
  const [isFollowing, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const prev = isFollowing;
    setFollowing(!prev);
    try {
      if (!prev) await followUser(targetUid);
      else await unfollowUser(targetUid);
    } catch {
      setFollowing(prev); // revert on failure
    } finally {
      setBusy(false);
    }
  }

  return (
    <TouchableOpacity
      onPress={toggle}
      disabled={busy}
      style={{
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
        borderWidth: 1, borderColor: '#8bbcff',
        backgroundColor: isFollowing ? '#e9f2ff' : '#fff',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {busy ? <ActivityIndicator size="small" /> : null}
        <Text style={{ color: '#0a66ff', fontWeight: '600' }}>
          {isFollowing ? 'Following' : 'Follow'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
