import { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, FlatList, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { fetchLeaderboard } from '../../lib/leaderboard';
import { Profile } from '../../types';
import { colors, spacing, radius, fontSize } from '../../constants/theme';

export default function VolunteerScreen() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadLeaderboard = useCallback(async () => {
    try {
      const data = await fetchLeaderboard();
      setProfiles(data);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load leaderboard.');
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadLeaderboard();
      setLoading(false);
    })();
  }, [loadLeaderboard]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadLeaderboard();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      data={profiles}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Volunteer Leaderboard</Text>
          <Text style={styles.subtitle}>Earn points by helping other students</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{errorMessage ?? 'No one has volunteered yet.'}</Text>
        </View>
      }
      renderItem={({ item, index }) => (
        <View style={styles.row}>
          <Text style={styles.rank}>{index + 1}</Text>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]} />
          )}
          <View style={styles.rowText}>
            <Text style={styles.name}>{item.full_name ?? 'Unknown'}</Text>
            {item.school_name ? <Text style={styles.school}>{item.school_name}</Text> : null}
          </View>
          <Text style={styles.points}>{item.points} pt{item.points === 1 ? '' : 's'}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  list: {
    padding: spacing.lg,
  },
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textDark,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: spacing.xs,
  },
  empty: {
    paddingTop: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMid,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rank: {
    width: 28,
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textMid,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    marginRight: spacing.sm,
  },
  avatarPlaceholder: {
    backgroundColor: colors.primaryLight,
  },
  rowText: {
    flex: 1,
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textDark,
  },
  school: {
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
  points: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
  },
});
