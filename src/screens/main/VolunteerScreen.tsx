import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { fetchLeaderboard } from '../../lib/leaderboard';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import LoadingScreen from '../../components/LoadingScreen';
import FadeInView from '../../components/FadeInView';
import { MainStackParamList, LeaderboardEntry } from '../../types';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';

const MEDALS: Record<number, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  0: { color: '#FFD700', icon: 'trophy' },
  1: { color: '#C0C0C0', icon: 'trophy' },
  2: { color: '#CD7F32', icon: 'trophy' },
};

export default function VolunteerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const [profiles, setProfiles] = useState<LeaderboardEntry[]>([]);
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
    return <LoadingScreen />;
  }

  return (
    <FlatList
      data={profiles}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Community Leaderboard 🏆</Text>
          <Text style={styles.subtitle}>Earn points by helping other students</Text>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="trophy-outline"
          title="No one has volunteered yet"
          subtitle={errorMessage ?? 'Be the first to help and claim the top spot!'}
        />
      }
      renderItem={({ item, index }) => {
        const medal = MEDALS[index];
        return (
          <FadeInView delay={Math.min(index, 6) * 40}>
            <TouchableOpacity
              style={[styles.row, medal && styles.rowTopThree]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('UserProfile', { userId: item.id })}
            >
              {medal ? (
                <Ionicons name={medal.icon} size={24} color={medal.color} style={styles.rankIcon} />
              ) : (
                <Text style={styles.rank}>{index + 1}</Text>
              )}
              <Avatar uri={item.avatar_url} size={44} />
              <View style={styles.rowText}>
                <Text style={styles.name}>{item.full_name ?? 'Unknown'}</Text>
                {item.school_name ? <Text style={styles.school}>{item.school_name}</Text> : null}
              </View>
              <View style={styles.pointsBadge}>
                <Text style={styles.points}>
                  {item.points} pt{item.points === 1 ? '' : 's'}
                </Text>
              </View>
            </TouchableOpacity>
          </FadeInView>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
  },
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xxl,
    color: colors.textDark,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
    ...shadow.card,
  },
  rowTopThree: {
    borderWidth: 1.5,
    borderColor: colors.warning,
  },
  rank: {
    width: 28,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontSize: fontSize.md,
    color: colors.textMid,
  },
  rankIcon: {
    width: 28,
    textAlign: 'center',
  },
  rowText: {
    flex: 1,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  school: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
  pointsBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  points: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
});
