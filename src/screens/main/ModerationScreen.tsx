import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useToast } from '../../contexts/ToastContext';
import { warmAlert } from '../../components/WarmAlert';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';
import { ACTION_LABEL, actionsFor, kindInfo, reasonLabel, type ModerationAction, type QueueItem } from '../../lib/moderation';
import { fetchModerationQueue, moderate } from '../../lib/moderationApi';
import { formatRelativeTime } from '../../lib/time';
import { errorMessage } from '../../lib/errors';
import { colors, spacing, radius, fontSize, fontFamily, typography } from '../../constants/theme';

// Moderators only (the server checks the role on every call). One card per
// reported thing, most-reported first.
export default function ModerationScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchModerationQueue());
      setFailed(null);
    } catch (err) {
      setFailed(errorMessage(err, "Couldn't load reports."));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const key = (i: QueueItem) => `${i.kind}:${i.target_id}`;

  const act = async (item: QueueItem, action: ModerationAction) => {
    setBusy(key(item));
    try {
      await moderate(item.kind, item.target_id, action);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setItems((list) => (list ?? []).filter((i) => key(i) !== key(item)));
      showToast(action === 'remove' ? 'Removed' : action === 'dismiss' ? 'Marked as fine' : 'Marked reviewed');
    } catch (err) {
      showToast(errorMessage(err, "Couldn't save that — try again"));
    } finally {
      setBusy(null);
    }
  };

  const confirm = (item: QueueItem, action: ModerationAction) => {
    if (action !== 'remove') return act(item, action);
    warmAlert(`Remove this ${kindInfo(item.kind).label.toLowerCase()}?`, "It's deleted for everyone and can't be brought back.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => act(item, 'remove') },
    ]);
  };

  if (failed && !items) {
    return <ErrorState title="Couldn't load reports" subtitle={failed} onRetry={load} />;
  }

  return (
    <View style={styles.flex}>
      <FlatList
        data={items ?? []}
        keyExtractor={key}
        contentContainerStyle={[styles.container, { paddingBottom: spacing.xxl + insets.bottom }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={
          <View>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Back">
              <Ionicons name="arrow-back" size={20} color={colors.textDark} />
            </TouchableOpacity>
            <Text style={styles.title}>Reports</Text>
            <Text style={styles.intro}>Most-reported first. Messages show only the reported message, never the rest of the chat.</Text>
            {!items ? <ActivityIndicator color={colors.primaryDark} style={{ marginTop: spacing.xl }} /> : null}
          </View>
        }
        ListEmptyComponent={items ? <EmptyState icon="checkmark-done-outline" title="All caught up" subtitle="No open reports right now." /> : null}
        renderItem={({ item }) => {
          const info = kindInfo(item.kind);
          const working = busy === key(item);
          return (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.kind}>
                  {info.emoji} {info.label}
                </Text>
                <Text style={styles.count}>
                  {item.report_count} {item.report_count === 1 ? 'report' : 'reports'} · {formatRelativeTime(item.last_reported)}
                </Text>
              </View>
              <Text style={[styles.preview, !item.preview && styles.previewGone]} numberOfLines={6}>
                {item.preview || 'Already deleted'}
              </Text>
              <Text style={styles.author}>by {item.author_name || 'a deleted account'}</Text>
              <View style={styles.reasons}>
                {item.reasons.map((r) => (
                  <View key={r} style={styles.reason}>
                    <Text style={styles.reasonText} numberOfLines={2}>
                      {reasonLabel(r)}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={styles.actions}>
                {working ? (
                  <ActivityIndicator color={colors.primaryDark} />
                ) : (
                  actionsFor(item.kind).map((a) => (
                    <TouchableOpacity
                      key={a}
                      style={[styles.action, a === 'remove' && styles.actionRemove]}
                      onPress={() => confirm(item, a)}
                      disabled={!!busy}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.actionText, a === 'remove' && styles.actionRemoveText]}>{ACTION_LABEL[a]}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </View>
          );
        }}
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
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.textMid,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  kind: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
  count: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.error,
  },
  preview: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    lineHeight: 22,
    color: colors.textDark,
  },
  previewGone: {
    fontStyle: 'italic',
    color: colors.textLight,
  },
  author: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
    marginTop: spacing.xs,
  },
  reasons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  reason: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '100%',
  },
  reasonText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: 'flex-end',
    minHeight: 36,
    alignItems: 'center',
  },
  action: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 3,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
  },
  actionText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primaryDark,
  },
  actionRemove: {
    backgroundColor: colors.error,
  },
  actionRemoveText: {
    color: '#fff',
  },
});
