import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useToast } from '../../contexts/ToastContext';
import { fetchLanterns, sendLantern, soundsLikeCrisis, toggleLanternHug, Lantern, LANTERN_MAX, LANTERN_STARTERS } from '../../lib/lanterns';
import { hasBlockedWords, KIND_WORDS_MESSAGE } from '../../lib/contentFilter';
import { formatRelativeTime } from '../../lib/time';
import LanternBackdrop from '../../components/LanternBackdrop';
import PrimaryButton from '../../components/PrimaryButton';
import SupportLines from '../../components/SupportLines';
import { colors, spacing, fontSize, fontFamily } from '../../constants/theme';
import { MainStackParamList } from '../../types';

// Lanterns: a quiet, warm place to set a worry down without your name, and
// to send warm notes to classmates who did. Always one tap from writing.

function LanternGlyph({ size = 30, dim = false }: { size?: number; dim?: boolean }) {
  return (
    <View style={[styles.glyph, { width: size, height: size * 1.25, opacity: dim ? 0.55 : 1 }]}>
      <View style={[styles.glyphGlow, { width: size * 1.8, height: size * 1.8, borderRadius: size }]} />
      <View style={[styles.glyphBody, { width: size * 0.7, height: size * 0.9, borderRadius: size * 0.22 }]} />
      <View style={[styles.glyphTop, { width: size * 0.42 }]} />
    </View>
  );
}

export { LanternGlyph };

// A soft opening line that follows the time of day.
function heartQuestion() {
  const h = new Date().getHours();
  if (h < 5) return 'Still awake? How are you, really?';
  if (h < 12) return "How's your heart this morning?";
  if (h < 18) return "How's your heart today?";
  return "How's your heart tonight?";
}

export default function LanternsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'Lanterns'>>();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [lanterns, setLanterns] = useState<Lantern[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // Shown before sending when the words suggest the writer may be in danger.
  const [showSupport, setShowSupport] = useState(false);

  const load = useCallback(async () => {
    try {
      setLanterns(await fetchLanterns());
    } catch {
      showToast("Couldn't load the lanterns");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Opened from Home's "Something on your mind?" card: go straight to writing.
  useEffect(() => {
    if (route.params?.compose) {
      setComposeOpen(true);
      navigation.setParams({ compose: false });
    }
  }, [route.params?.compose, navigation]);

  const openCompose = (starter?: string) => {
    if (starter && !text.trim()) setText(starter);
    setComposeOpen(true);
  };

  const doSend = async () => {
    setSending(true);
    try {
      await sendLantern(text);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setComposeOpen(false);
      setShowSupport(false);
      setText('');
      showToast('Your lantern is up 🏮 Thank you for sharing it.');
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't send the lantern");
    } finally {
      setSending(false);
    }
  };

  // "Me too" straight from the list.
  const handleHug = async (l: Lantern) => {
    const next = !l.hugged_by_me;
    const bump = (on: boolean) =>
      setLanterns((all) =>
        all.map((x) => (x.id === l.id ? { ...x, hugged_by_me: on, hug_count: Math.max(0, x.hug_count + (on ? 1 : -1)) } : x))
      );
    bump(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const now = await toggleLanternHug(l.id);
      if (now !== next) bump(now);
    } catch (err) {
      bump(!next);
      showToast(err instanceof Error ? err.message : "Couldn't do that");
    }
  };

  const handleSend = () => {
    if (sending || text.trim().length < 2) return;
    if (hasBlockedWords(text)) {
      showToast(KIND_WORDS_MESSAGE);
      return;
    }
    if (soundsLikeCrisis(text) && !showSupport) {
      setShowSupport(true);
      return;
    }
    doSend();
  };

  const header = (
    <View style={{ gap: spacing.md }}>
      {/* Always-open invitation to write, like a letter waiting for you. */}
      <View style={styles.paper}>
        <Text style={styles.paperTitle}>{heartQuestion()}</Text>
        <Text style={styles.paperSub}>Whatever it is, big or small, you can set it down here.</Text>
        <TouchableOpacity
          style={styles.fakeInput}
          activeOpacity={0.85}
          onPress={() => openCompose()}
          accessibilityRole="button"
          accessibilityLabel="Write a lantern"
        >
          <Text style={styles.fakeInputText}>I've been feeling…</Text>
          <Ionicons name="create-outline" size={18} color="#B07A4A" />
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.paperChipsBleed} contentContainerStyle={styles.paperChips}>
          {LANTERN_STARTERS.map((s) => (
            <TouchableOpacity key={s} style={styles.paperChip} onPress={() => openCompose(s)} activeOpacity={0.8}>
              <Text style={styles.paperChipText}>{s.trim()}…</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.promises}>
        <Text style={styles.promise}>🔒 No name</Text>
        <Text style={styles.promiseDot}>·</Text>
        <Text style={styles.promise}>💛 Only kindness back</Text>
        <Text style={styles.promiseDot}>·</Text>
        <Text style={styles.promise}>🌙 Fades in 3 days</Text>
      </View>

      {lanterns.length ? <Text style={styles.section}>Glowing at your school</Text> : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <LanternBackdrop />

      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={20} color={colors.warm.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Lanterns</Text>
          <Text style={styles.subtitle}>A quiet place to let a worry float up</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.warm.honey} style={{ marginTop: spacing.xxl }} />
      ) : (
        <FlatList
          data={lanterns}
          keyExtractor={(l) => l.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 120 }]}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.empty}>
              <LanternGlyph size={32} dim />
              <Text style={styles.emptyTitle}>The sky is quiet right now</Text>
              <Text style={styles.emptySub}>
                Yours could be the first lantern. Or come back later and send someone a little warmth.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, item.mine && styles.cardMine]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('LanternDetail', { lanternId: item.id, text: item.text, mine: item.mine, crisis: item.crisis, createdAt: item.created_at, hugCount: item.hug_count, huggedByMe: item.hugged_by_me })}
              accessibilityRole="button"
              accessibilityLabel={`A lantern: ${item.text}`}
            >
              <View style={styles.cardTop}>
                <LanternGlyph size={18} />
                <Text style={styles.cardWho}>{item.mine ? 'Your lantern' : 'Someone at your school'}</Text>
                <Text style={styles.cardTime}>{formatRelativeTime(item.created_at)}</Text>
              </View>
              <Text style={styles.cardText} numberOfLines={4}>
                {item.text}
              </Text>
              <View style={styles.cardBottom}>
                <Text style={styles.cardNotes}>
                  {item.note_count > 0
                    ? `💛 ${item.note_count} ${item.note_count === 1 ? 'note' : 'notes'}`
                    : item.mine
                      ? 'Warm notes will find you here'
                      : ''}
                  {item.mine && item.hug_count > 0 ? `  ·  🫂 ${item.hug_count} feel the same` : ''}
                  {item.noted_by_me ? '  ·  you sent one' : ''}
                </Text>
                {!item.mine ? (
                  <TouchableOpacity
                    style={[styles.hugPill, item.hugged_by_me && styles.hugPillOn]}
                    onPress={() => handleHug(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: item.hugged_by_me }}
                    accessibilityLabel="Me too"
                  >
                    <Text style={[styles.hugPillText, item.hugged_by_me && styles.hugPillTextOn]}>
                      🫂 Me too{item.hug_count > 0 ? ` ${item.hug_count}` : ''}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {!item.mine && !item.noted_by_me ? (
                  <View style={styles.warmthPill}>
                    <Ionicons name="heart" size={12} color={colors.warm.honeyInk} />
                    <Text style={styles.warmthPillText}>Send warmth</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.md }]}>
        <PrimaryButton variant="warm" title="Send up a lantern" icon="flame-outline" onPress={() => openCompose()} />
      </View>

      <Modal visible={composeOpen} transparent animationType="slide" onRequestClose={() => setComposeOpen(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setComposeOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.handle} />
            <ScrollView contentContainerStyle={{ gap: spacing.sm }} keyboardShouldPersistTaps="handled">
              <View style={{ alignSelf: 'center' }}>
                <LanternGlyph size={34} />
              </View>
              <Text style={styles.sheetTitle}>Take your time</Text>
              <Text style={styles.sheetSub}>
                No one will see your name. Only classmates at your school see it, and it fades after 3 days.
              </Text>
              {showSupport ? <SupportLines /> : null}
              <TextInput
                style={styles.input}
                placeholder="I've been feeling…"
                placeholderTextColor={colors.warm.creamFaint}
                value={text}
                onChangeText={(t) => {
                  setText(t);
                  if (showSupport && !soundsLikeCrisis(t)) setShowSupport(false);
                }}
                maxLength={LANTERN_MAX}
                multiline
                autoFocus
              />
              {!text ? (
                <View style={styles.sheetChips}>
                  {LANTERN_STARTERS.map((s) => (
                    <TouchableOpacity key={s} style={styles.sheetChip} onPress={() => setText(s)} activeOpacity={0.8}>
                      <Text style={styles.sheetChipText}>{s.trim()}…</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={styles.count}>
                  {text.length}/{LANTERN_MAX}
                </Text>
              )}
              <PrimaryButton
                variant="warm"
                title={showSupport ? 'Send my lantern too' : 'Let it float up'}
                icon="flame"
                loading={sending}
                disabled={text.trim().length < 2}
                onPress={showSupport ? doSend : handleSend}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const PAPER = '#FFF1DE';
const PAPER_INK = '#4A2E1E';

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#1B1426',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.warm.glassSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.xl,
    color: colors.warm.cream,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.warm.creamMuted,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm + 4,
  },
  paper: {
    backgroundColor: PAPER,
    borderRadius: 24,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  paperTitle: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.lg,
    color: PAPER_INK,
  },
  paperSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 19,
    color: 'rgba(74,46,30,0.72)',
  },
  fakeInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(176,122,74,0.25)',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    marginTop: spacing.xs,
  },
  fakeInputText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: 'rgba(74,46,30,0.45)',
  },
  paperChips: {
    gap: spacing.xs + 2,
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  paperChipsBleed: {
    marginHorizontal: -spacing.lg,
  },
  paperChip: {
    backgroundColor: 'rgba(245,194,122,0.35)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  paperChipText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: PAPER_INK,
  },
  promises: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  promise: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.warm.creamMuted,
  },
  promiseDot: {
    fontSize: fontSize.xs,
    color: colors.warm.creamFaint,
  },
  section: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.warm.honey,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: 'rgba(52,34,48,0.92)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.warm.line,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardMine: {
    borderColor: 'rgba(245,194,122,0.4)',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardWho: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.warm.honey,
  },
  cardTime: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.warm.creamFaint,
  },
  cardText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    lineHeight: 22,
    color: colors.warm.cream,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardNotes: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.warm.creamMuted,
  },
  hugPill: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,194,122,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  hugPillOn: {
    backgroundColor: 'rgba(245,194,122,0.22)',
    borderColor: colors.warm.honey,
  },
  hugPillText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.warm.cream,
  },
  hugPillTextOn: {
    color: colors.warm.honey,
  },
  warmthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warm.honey,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  warmthPillText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.warm.honeyInk,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.warm.cream,
    marginTop: spacing.sm,
  },
  emptySub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.warm.creamMuted,
    textAlign: 'center',
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: 'rgba(48,28,36,0.9)',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,12,18,0.5)',
  },
  sheet: {
    backgroundColor: '#2A1D2B',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: colors.warm.line,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '90%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.warm.line,
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.xl,
    color: colors.warm.cream,
    textAlign: 'center',
  },
  sheetSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 19,
    color: colors.warm.creamFaint,
    textAlign: 'center',
  },
  input: {
    backgroundColor: colors.warm.glassSoft,
    borderRadius: 16,
    padding: spacing.md,
    minHeight: 120,
    textAlignVertical: 'top',
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.warm.cream,
  },
  sheetChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  sheetChip: {
    backgroundColor: 'rgba(245,194,122,0.14)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  sheetChipText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.warm.cream,
  },
  count: {
    alignSelf: 'flex-end',
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.warm.creamFaint,
  },
  glyph: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(255,170,90,0.22)',
  },
  glyphBody: {
    backgroundColor: '#FFB46E',
    borderWidth: 1.5,
    borderColor: '#FFD9A8',
  },
  glyphTop: {
    position: 'absolute',
    top: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#8A4B2A',
  },
});
