import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  fetchSchoolSky,
  setMyStar,
  removeMyStar,
  starPosition,
  skyMood,
  SKY_MOODS,
  SKY_NOTE_MAX,
  SkyMood,
  SkyStar,
} from '../../lib/sky';
import { fetchBlockedUserIds } from '../../lib/blocks';
import { getOrCreateConversation } from '../../lib/chat';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import PrimaryButton from '../../components/PrimaryButton';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';
import { MainStackParamList } from '../../types';

const STAR_SIZE = 46;

// One classmate's star: a glowing mood bubble that gently breathes.
function SkyStarButton({
  star,
  index,
  mine,
  selected,
  onPress,
}: {
  star: SkyStar;
  index: number;
  mine: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const mood = skyMood(star.mood);
  const pos = starPosition(star.user_id, index);
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay((index * 370) % 1800),
        Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, index]);

  const first = star.profile?.full_name?.trim().split(/\s+/)[0] ?? 'Student';
  return (
    <View style={[styles.starWrap, { left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }]}>
      <Animated.View
        style={[
          styles.starGlow,
          { backgroundColor: mood.color },
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.4] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
          },
        ]}
      />
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={[styles.star, { borderColor: mood.color }, selected && styles.starSelected, mine && styles.starMine]}
        accessibilityRole="button"
        accessibilityLabel={`${mine ? 'Your star' : first}: feeling ${mood.label}${star.note ? `, ${star.note}` : ''}`}
      >
        <Text style={styles.starEmoji}>{mood.emoji}</Text>
      </TouchableOpacity>
      <Text style={[styles.starName, mine && styles.starNameMine]} numberOfLines={1}>
        {mine ? 'You' : first}
      </Text>
    </View>
  );
}

export default function SchoolSkyScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'SchoolSky'>>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();

  const [stars, setStars] = useState<SkyStar[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(!!route.params?.openComposer);
  const [mood, setMood] = useState<SkyMood>('happy');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [sky, blocked] = await Promise.all([
        fetchSchoolSky(),
        fetchBlockedUserIds(user.id).catch(() => new Set<string>()),
      ]);
      setStars(sky.filter((s) => !blocked.has(s.user_id)));
    } catch {
      showToast("Couldn't load the sky");
    } finally {
      setLoading(false);
    }
  }, [user, showToast]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const myStar = stars.find((s) => s.user_id === user?.id) ?? null;
  const selected = stars.find((s) => s.user_id === selectedId) ?? null;

  const openComposer = () => {
    setMood((myStar?.mood as SkyMood) ?? 'happy');
    setNote(myStar?.note ?? '');
    setSelectedId(null);
    setComposerOpen(true);
  };

  // The composer can open straight from Home ("Add your star"); prefill it
  // once the current star has loaded.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!composerOpen || prefilledRef.current || loading) return;
    prefilledRef.current = true;
    if (myStar) {
      setMood(myStar.mood);
      setNote(myStar.note ?? '');
    }
  }, [composerOpen, loading, myStar]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await setMyStar(mood, note);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setComposerOpen(false);
      showToast(myStar ? 'Your star is updated ✨' : 'Your star is in the sky ✨');
      await load();
      if (user) setSelectedId(user.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't save your star");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!user) return;
    try {
      await removeMyStar(user.id);
      setSelectedId(null);
      showToast('Your star is gone for today');
      await load();
    } catch {
      showToast("Couldn't remove your star");
    }
  };

  const handleSayHi = async (star: SkyStar) => {
    if (!star.profile || openingChat) return;
    setOpeningChat(true);
    try {
      const conversationId = await getOrCreateConversation(star.user_id);
      const m = skyMood(star.mood);
      navigation.navigate('Conversation', {
        conversationId,
        otherUser: { id: star.profile.id, full_name: star.profile.full_name, avatar_url: star.profile.avatar_url },
        prefillText: `Saw your star ${m.emoji} `,
      });
    } catch {
      showToast("Couldn't open the chat");
    } finally {
      setOpeningChat(false);
    }
  };

  const others = stars.filter((s) => s.user_id !== user?.id).length;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="sky" cx="70%" cy="10%" r="110%">
            <Stop offset="0" stopColor="#33298A" />
            <Stop offset="0.5" stopColor={colors.night} />
            <Stop offset="1" stopColor={colors.background} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#sky)" />
      </Svg>

      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>School Sky</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {loading
              ? 'Looking up…'
              : stars.length === 0
                ? `Quiet tonight${route.params?.schoolName ? ` at ${route.params.schoolName}` : ''}`
                : `${stars.length} ${stars.length === 1 ? 'star' : 'stars'}${route.params?.schoolName ? ` at ${route.params.schoolName}` : ''} today`}
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.sky} activeOpacity={1} onPress={() => setSelectedId(null)}>
        {loading ? (
          <ActivityIndicator color={colors.sticker.lilac} style={styles.loading} />
        ) : stars.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🌙</Text>
            <Text style={styles.emptyTitle}>The sky is quiet</Text>
            <Text style={styles.emptySub}>Be the first star at your school today. Classmates will see how you're doing.</Text>
          </View>
        ) : (
          stars.map((s, i) => (
            <SkyStarButton
              key={s.user_id}
              star={s}
              index={i}
              mine={s.user_id === user?.id}
              selected={s.user_id === selectedId}
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedId(s.user_id === selectedId ? null : s.user_id);
              }}
            />
          ))
        )}
      </TouchableOpacity>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.md }]}>
        {selected ? (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Avatar uri={selected.profile?.avatar_url ?? null} size={44} />
              <View style={styles.cardText}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {selected.user_id === user?.id ? 'Your star' : selected.profile?.full_name ?? 'Student'}
                </Text>
                <Text style={styles.cardMeta}>
                  {skyMood(selected.mood).emoji} Feeling {skyMood(selected.mood).label.toLowerCase()} ·{' '}
                  {formatRelativeTime(selected.updated_at)}
                </Text>
              </View>
            </View>
            {selected.note ? <Text style={styles.cardNote}>“{selected.note}”</Text> : null}
            <View style={styles.cardActions}>
              {selected.user_id === user?.id ? (
                <>
                  <PrimaryButton title="Change" size="sm" icon="create-outline" onPress={openComposer} style={styles.cardButton} />
                  <PrimaryButton title="Remove" size="sm" variant="outline" onPress={handleRemove} style={styles.cardButton} />
                </>
              ) : (
                <>
                  <PrimaryButton
                    title="Say hi"
                    size="sm"
                    icon="chatbubble-ellipses-outline"
                    loading={openingChat}
                    onPress={() => handleSayHi(selected)}
                    style={styles.cardButton}
                  />
                  <PrimaryButton
                    title="Profile"
                    size="sm"
                    variant="outline"
                    onPress={() => navigation.navigate('UserProfile', { userId: selected.user_id })}
                    style={styles.cardButton}
                  />
                </>
              )}
            </View>
          </View>
        ) : (
          <>
            {!loading && stars.length > 0 ? (
              <Text style={styles.hint}>
                {others > 0 ? 'Tap a star to see how a classmate is doing' : 'Your star is up — classmates will see it today'}
              </Text>
            ) : null}
            <PrimaryButton
              title={myStar ? 'Change your star' : 'Add your star'}
              icon="sparkles-outline"
              onPress={openComposer}
            />
          </>
        )}
      </View>

      <Modal visible={composerOpen} transparent animationType="slide" onRequestClose={() => setComposerOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setComposerOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>How's today going?</Text>
            <Text style={styles.sheetSub}>Your star shows to classmates for 24 hours.</Text>
            <View style={styles.moodGrid}>
              {SKY_MOODS.map((m) => {
                const on = m.key === mood;
                return (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.moodChip, on && { borderColor: m.color, backgroundColor: colors.raised }]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setMood(m.key);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={m.label}
                  >
                    <Text style={styles.moodEmoji}>{m.emoji}</Text>
                    <Text style={[styles.moodLabel, on && { color: m.color }]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              style={styles.noteInput}
              placeholder="Add a line (optional)"
              placeholderTextColor={colors.textLight}
              value={note}
              onChangeText={setNote}
              maxLength={SKY_NOTE_MAX}
            />
            <Text style={styles.noteCount}>
              {note.length}/{SKY_NOTE_MAX}
            </Text>
            <PrimaryButton
              title={myStar ? 'Update my star' : 'Put it in the sky'}
              icon="sparkles"
              loading={saving}
              onPress={handleSave}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.xl,
    color: '#fff',
  },
  subtitle: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.sticker.lilac,
  },
  sky: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  loading: {
    marginTop: spacing.xxl,
  },
  starWrap: {
    position: 'absolute',
    width: STAR_SIZE + 24,
    marginLeft: -(STAR_SIZE + 24) / 2,
    alignItems: 'center',
  },
  starGlow: {
    position: 'absolute',
    top: -6,
    width: STAR_SIZE + 12,
    height: STAR_SIZE + 12,
    borderRadius: (STAR_SIZE + 12) / 2,
  },
  star: {
    width: STAR_SIZE,
    height: STAR_SIZE,
    borderRadius: STAR_SIZE / 2,
    borderWidth: 2,
    backgroundColor: 'rgba(22,21,43,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  starSelected: {
    transform: [{ scale: 1.15 }],
    backgroundColor: colors.raised,
  },
  starMine: {
    borderWidth: 3,
  },
  starEmoji: {
    fontSize: 22,
  },
  starName: {
    marginTop: 4,
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    color: colors.textMid,
    maxWidth: STAR_SIZE + 24,
  },
  starNameMine: {
    color: colors.sticker.yellow,
  },
  empty: {
    alignItems: 'center',
    marginTop: spacing.xxl * 2,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyEmoji: {
    fontSize: 44,
  },
  emptyTitle: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.lg,
    color: '#fff',
  },
  emptySub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    textAlign: 'center',
  },
  bottom: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textLight,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardText: {
    flex: 1,
  },
  cardName: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  cardMeta: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
  cardNote: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cardButton: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(10,9,26,0.6)',
  },
  sheet: {
    backgroundColor: colors.cardBg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.xl,
    color: colors.textDark,
  },
  sheetSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textLight,
    marginTop: -spacing.xs,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginVertical: spacing.sm,
  },
  moodChip: {
    width: '31%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    gap: 2,
  },
  moodEmoji: {
    fontSize: 26,
  },
  moodLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  noteInput: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  noteCount: {
    alignSelf: 'flex-end',
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: -spacing.xs,
  },
});
