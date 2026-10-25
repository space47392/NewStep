import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { BlockedAccount, fetchBlockedAccounts, unblockUser } from '../../lib/blocks';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import FadeInView from '../../components/FadeInView';
import { warmAlert } from '../../components/WarmAlert';
import { colors, spacing, radius, fontSize, fontFamily, typography } from '../../constants/theme';

export default function BlockedAccountsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<BlockedAccount[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setAccounts(await fetchBlockedAccounts(user.id));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const confirmUnblock = (account: BlockedAccount) => {
    const name = account.full_name ?? 'this person';
    warmAlert(`Unblock ${name}?`, 'They’ll be able to see your posts and message you again. They won’t be told.', [
      {
        text: 'Unblock',
        onPress: async () => {
          if (!user) return;
          setBusyId(account.id);
          try {
            await unblockUser({ blockerId: user.id, blockedId: account.id });
            setAccounts((prev) => (prev ?? []).filter((a) => a.id !== account.id));
            showToast(`Unblocked ${name}`);
          } catch {
            showToast("Couldn't unblock — check your connection and try again");
          } finally {
            setBusyId(null);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.flex}>
      <FlatList
        data={accounts ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={[styles.container, { paddingBottom: spacing.xxl + insets.bottom }]}
        ListHeaderComponent={
          <FadeInView>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="arrow-back" size={20} color={colors.textDark} accessibilityLabel="Back" />
            </TouchableOpacity>
            <Text style={styles.title}>Blocked accounts</Text>
            <Text style={styles.intro}>People you block can’t message you or see your posts. They aren’t told.</Text>
          </FadeInView>
        }
        ListEmptyComponent={
          failed ? (
            <ErrorState onRetry={load} />
          ) : accounts === null ? (
            <ActivityIndicator color={colors.primaryDark} style={styles.loading} />
          ) : (
            <EmptyState icon="shield-checkmark-outline" title="No one is blocked" subtitle="If someone ever makes NewStep feel unsafe, you can block them from their profile." />
          )
        }
        renderItem={({ item, index }) => (
          <FadeInView delay={Math.min(index, 6) * 40}>
            <View style={styles.row}>
              <Avatar uri={item.avatar_url} size={44} />
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.full_name ?? 'Unknown'}
                </Text>
                {item.username ? (
                  <Text style={styles.username} numberOfLines={1}>
                    @{item.username}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity style={styles.unblock} onPress={() => confirmUnblock(item)} disabled={busyId === item.id} activeOpacity={0.7}>
                {busyId === item.id ? <ActivityIndicator size="small" color={colors.textMid} /> : <Text style={styles.unblockText}>Unblock</Text>}
              </TouchableOpacity>
            </View>
          </FadeInView>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.largeTitle,
    color: colors.textDark,
  },
  intro: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    lineHeight: 22,
    color: colors.textMid,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  loading: {
    marginTop: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  rowText: {
    flex: 1,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  username: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  unblock: {
    minWidth: 86,
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  unblockText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
});
