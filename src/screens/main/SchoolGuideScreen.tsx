import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { addSchoolTip, deleteSchoolTip, fetchSchoolTips, reportSchoolTip, SchoolTip, TIP_CATEGORIES, TipCategory, tipCategory, toggleTipHelpful } from '../../lib/tips';
import { fetchBlockedUserIds } from '../../lib/blocks';
import { hasBlockedWords, KIND_WORDS_MESSAGE } from '../../lib/contentFilter';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import FadeInView from '../../components/FadeInView';
import PressableScale from '../../components/PressableScale';
import PrimaryButton from '../../components/PrimaryButton';
import NSIcon from '../../components/NSIcon';
import ErrorState from '../../components/ErrorState';
import { warmAlert } from '../../components/WarmAlert';
import { colors, spacing, radius, fontSize, fontFamily, typography } from '../../constants/theme';
import { MainStackParamList } from '../../types';
import { errorMessage } from '../../lib/errors';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export default function SchoolGuideScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tips, setTips] = useState<SchoolTip[] | null>(null);
  const [helped, setHelped] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<TipCategory | 'all'>('all');
  const [sort, setSort] = useState<'helpful' | 'new'>('helpful');
  const [composeOpen, setComposeOpen] = useState(false);
  const [draftCategory, setDraftCategory] = useState<TipCategory>('around');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [{ tips: t, helped: h }, blocked] = await Promise.all([fetchSchoolTips(user.id), fetchBlockedUserIds(user.id).catch(() => new Set<string>())]);
      setTips(t.filter((x) => !x.author_id || !blocked.has(x.author_id)));
      setHelped(h);
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

  const shown = useMemo(() => {
    const list = (tips ?? []).filter((t) => filter === 'all' || t.category === filter);
    return sort === 'new' ? [...list].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)) : list;
  }, [tips, filter, sort]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    (tips ?? []).forEach((t) => (c[t.category] = (c[t.category] ?? 0) + 1));
    return c;
  }, [tips]);

  const openCompose = () => {
    setDraftCategory(filter === 'all' ? 'around' : filter);
    setDraftTitle('');
    setDraftBody('');
    setComposeOpen(true);
  };

  const save = async () => {
    if (saving) return;
    if (draftTitle.trim().length < 3) {
      showToast('Give your tip a short title');
      return;
    }
    if (hasBlockedWords(draftTitle) || hasBlockedWords(draftBody)) {
      showToast(KIND_WORDS_MESSAGE);
      return;
    }
    setSaving(true);
    try {
      await addSchoolTip(draftCategory, draftTitle, draftBody);
      setComposeOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast('Thanks for helping someone new 💛');
      setSort('new');
      await load();
    } catch (err) {
      showToast(errorMessage(err, "Couldn't share your tip"));
    } finally {
      setSaving(false);
    }
  };

  const toggleHelped = async (tip: SchoolTip) => {
    const was = helped.has(tip.id);
    Haptics.selectionAsync().catch(() => {});
    setHelped((h) => {
      const n = new Set(h);
      if (was) n.delete(tip.id);
      else n.add(tip.id);
      return n;
    });
    setTips((list) => (list ?? []).map((t) => (t.id === tip.id ? { ...t, helpful_count: Math.max(0, t.helpful_count + (was ? -1 : 1)) } : t)));
    try {
      const n = await toggleTipHelpful(tip.id);
      setTips((list) => (list ?? []).map((t) => (t.id === tip.id ? { ...t, helpful_count: n } : t)));
    } catch (err) {
      setHelped((h) => {
        const n = new Set(h);
        if (was) n.add(tip.id);
        else n.delete(tip.id);
        return n;
      });
      setTips((list) => (list ?? []).map((t) => (t.id === tip.id ? { ...t, helpful_count: tip.helpful_count } : t)));
      showToast(errorMessage(err, "Couldn't save that"));
    }
  };

  const openMenu = (tip: SchoolTip) => {
    const mine = tip.author_id === user?.id;
    warmAlert(tip.title, undefined, [
      mine
        ? {
            text: 'Delete tip',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteSchoolTip(tip.id);
                setTips((list) => (list ?? []).filter((t) => t.id !== tip.id));
              } catch {
                showToast("Couldn't delete it");
              }
            },
          }
        : {
            text: 'Report tip',
            style: 'destructive',
            onPress: async () => {
              try {
                await reportSchoolTip(tip.id);
                showToast("Thanks — we'll take a look");
              } catch {
                showToast("Couldn't send the report");
              }
            },
          },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (failed && !tips) return <ErrorState onRetry={load} />;

  const header = (
    <View>
      <FadeInView>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={20} color={colors.textDark} accessibilityLabel="Back" />
        </TouchableOpacity>
        <Text style={styles.title}>School guide</Text>
        <Text style={styles.intro}>Tips from classmates — the stuff nobody tells you on day one.</Text>
      </FadeInView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsBleed}>
        {[{ key: 'all' as const, label: 'All', emoji: '' }, ...TIP_CATEGORIES].map((c) => {
          const on = filter === c.key;
          const n = c.key === 'all' ? tips?.length ?? 0 : counts[c.key] ?? 0;
          return (
            <PressableScale key={c.key} style={[styles.chip, on && styles.chipOn]} pressedScale={0.94} onPress={() => setFilter(c.key)}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {c.emoji ? `${c.emoji} ` : ''}
                {c.label}
                {n > 0 ? ` · ${n}` : ''}
              </Text>
            </PressableScale>
          );
        })}
      </ScrollView>

      <View style={styles.sortRow}>
        {(['helpful', 'new'] as const).map((k) => (
          <TouchableOpacity key={k} onPress={() => setSort(k)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Text style={[styles.sortText, sort === k && styles.sortTextOn]}>{k === 'helpful' ? 'Most helpful' : 'Newest'}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.flex}>
      <FlatList
        data={shown}
        keyExtractor={(t) => t.id}
        contentContainerStyle={[styles.container, { paddingBottom: 120 + insets.bottom }]}
        ListHeaderComponent={header}
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
        ListEmptyComponent={
          tips === null ? (
            <ActivityIndicator color={colors.primaryDark} style={{ marginTop: spacing.xl }} />
          ) : (
            <View style={styles.empty}>
              <NSIcon name="backpack" size={44} />
              <Text style={styles.emptyTitle}>{filter === 'all' ? 'No tips yet' : `No ${tipCategory(filter).label.toLowerCase()} tips yet`}</Text>
              <Text style={styles.emptySub}>Be the first to share what you wish you'd known.</Text>
              <PrimaryButton title="Share a tip" icon="add" onPress={openCompose} style={{ marginTop: spacing.md }} />
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const cat = tipCategory(item.category);
          const on = helped.has(item.id);
          const mine = item.author_id === user?.id;
          return (
            <FadeInView delay={Math.min(index, 6) * 35}>
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardCat}>
                    {cat.emoji} {cat.label}
                  </Text>
                  <TouchableOpacity onPress={() => openMenu(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Tip options">
                    <Ionicons name="ellipsis-horizontal" size={18} color={colors.textLight} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
                {item.body ? <Text style={styles.cardBody}>{item.body}</Text> : null}
                <View style={styles.cardFoot}>
                  <TouchableOpacity
                    style={styles.author}
                    disabled={!item.author}
                    onPress={() => item.author && navigation.navigate('UserProfile', { userId: item.author.id })}
                  >
                    <Avatar uri={item.author?.avatar_url ?? null} size={22} />
                    <Text style={styles.authorText} numberOfLines={1}>
                      {mine ? 'You' : item.author?.full_name ?? 'A classmate'} · {formatRelativeTime(item.created_at)}
                    </Text>
                  </TouchableOpacity>
                  {/* You can't mark your own tip; it just shows the count once there is one. */}
                  {mine && item.helpful_count === 0 ? null : (
                    <PressableScale
                      style={[styles.helped, on && styles.helpedOn]}
                      pressedScale={0.9}
                      disabled={mine}
                      onPress={() => toggleHelped(item)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Ionicons name={on ? 'heart' : 'heart-outline'} size={15} color={on ? colors.error : colors.textMid} />
                      <Text style={[styles.helpedText, on && styles.helpedTextOn]}>
                        {item.helpful_count > 0 ? `${item.helpful_count} ` : ''}
                        {mine ? 'found it helpful' : on ? 'Helped' : 'This helped'}
                      </Text>
                    </PressableScale>
                  )}
                </View>
              </View>
            </FadeInView>
          );
        }}
      />

      {tips && tips.length > 0 ? (
        <PressableScale style={[styles.fab, { bottom: spacing.lg + insets.bottom }]} onPress={openCompose} accessibilityRole="button" accessibilityLabel="Share a tip">
          <Ionicons name="add" size={20} color={colors.onPrimary} />
          <Text style={styles.fabText}>Share a tip</Text>
        </PressableScale>
      ) : null}

      <Modal visible={composeOpen} transparent animationType="slide" onRequestClose={() => setComposeOpen(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setComposeOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Share a tip</Text>
            <Text style={styles.sheetSub}>What do you wish you'd known when you were new?</Text>
            <View style={styles.catGrid}>
              {TIP_CATEGORIES.map((c) => {
                const on = draftCategory === c.key;
                return (
                  <TouchableOpacity key={c.key} style={[styles.catTile, on && styles.catTileOn]} onPress={() => setDraftCategory(c.key)} activeOpacity={0.85}>
                    <Text style={styles.catEmoji}>{c.emoji}</Text>
                    <Text style={[styles.catLabel, on && styles.catLabelOn]} numberOfLines={1}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              style={styles.input}
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder={tipCategory(draftCategory).starter}
              placeholderTextColor={colors.textLight}
              maxLength={80}
            />
            <TextInput
              style={[styles.input, styles.inputBody]}
              value={draftBody}
              onChangeText={setDraftBody}
              placeholder="A little more detail (optional)"
              placeholderTextColor={colors.textLight}
              maxLength={500}
              multiline
            />
            <PrimaryButton title="Share it" icon="sparkles" loading={saving} disabled={draftTitle.trim().length < 3} onPress={save} style={{ marginTop: spacing.md }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    fontSize: fontSize.md,
    lineHeight: 22,
    color: colors.textMid,
    marginTop: spacing.xs,
  },
  chipsBleed: {
    marginHorizontal: -spacing.lg,
    marginTop: spacing.lg,
  },
  chips: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  chip: {
    borderRadius: radius.full,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  chipOn: {
    backgroundColor: colors.textDark,
    borderColor: colors.textDark,
  },
  chipText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  chipTextOn: {
    color: '#FFFFFF',
  },
  sortRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    marginLeft: 4,
  },
  sortText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
  sortTextOn: {
    fontFamily: fontFamily.bold,
    color: colors.textDark,
  },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.md,
    marginTop: spacing.sm,
    gap: 6,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardCat: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.primaryDark,
  },
  cardTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    lineHeight: 22,
    color: colors.textDark,
  },
  cardBody: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.textMid,
  },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
  },
  author: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  authorText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  helped: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
  },
  helpedOn: {
    backgroundColor: colors.errorLight,
  },
  helpedText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
  helpedTextOn: {
    color: colors.error,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: 6,
  },
  emptyTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.textDark,
    marginTop: spacing.sm,
  },
  emptySub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.onPrimary,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,14,8,0.4)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontFamily: fontFamily.brand,
    fontSize: 24,
    color: colors.textDark,
    textAlign: 'center',
  },
  sheetSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    textAlign: 'center',
    marginTop: 2,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  catTile: {
    width: '31.5%',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.cardBg,
    paddingVertical: spacing.sm,
  },
  catTileOn: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primaryLight,
  },
  catEmoji: {
    fontSize: 20,
  },
  catLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textMid,
    marginTop: 2,
  },
  catLabelOn: {
    fontFamily: fontFamily.bold,
    color: colors.primaryDark,
  },
  input: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textDark,
    marginTop: spacing.sm,
  },
  inputBody: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
});
