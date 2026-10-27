import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
import { askBuddy, BuddyPair, BuddyPerson, BuddyState, BuddySuggestion, endBuddy, fetchBuddyState, respondBuddy, setBuddyVolunteer, suggestBuddies } from '../../lib/buddies';
import { getOrCreateConversation } from '../../lib/chat';
import Avatar from '../../components/Avatar';
import FadeInView from '../../components/FadeInView';
import NSIcon from '../../components/NSIcon';
import PrimaryButton from '../../components/PrimaryButton';
import ErrorState from '../../components/ErrorState';
import { warmAlert } from '../../components/WarmAlert';
import { colors, spacing, radius, fontSize, fontFamily, typography } from '../../constants/theme';
import { MainStackParamList } from '../../types';
import { errorMessage } from '../../lib/errors';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const first = (p: { full_name: string | null } | null | undefined) => p?.full_name?.trim().split(/\s+/)[0] ?? 'them';
const DEFAULT_ASK = "Hi! I'm new here — would you be my buddy for my first few weeks?";

export default function BuddyScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [state, setState] = useState<BuddyState | null>(null);
  const [suggestions, setSuggestions] = useState<BuddySuggestion[]>([]);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<BuddySuggestion | null>(null);
  const [askText, setAskText] = useState(DEFAULT_ASK);
  const [intro, setIntro] = useState('');
  const [editingIntro, setEditingIntro] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const s = await fetchBuddyState(user.id);
      setState(s);
      setIntro(s.volunteer?.intro ?? '');
      setSuggestions(s.mine ? [] : await suggestBuddies().catch(() => []));
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

  const run = async (key: string, fn: () => Promise<void>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      if (done) showToast(done);
      await load();
    } catch (err) {
      showToast(errorMessage(err, "Couldn't do that — try again"));
    } finally {
      setBusy(null);
    }
  };

  const openChat = async (person: BuddyPerson | null) => {
    if (!person) return;
    try {
      const conversationId = await getOrCreateConversation(person.id);
      navigation.navigate('Conversation', { conversationId, otherUser: { id: person.id, full_name: person.full_name, avatar_url: person.avatar_url } });
    } catch {
      showToast("Couldn't open the chat");
    }
  };

  const sendAsk = () => {
    if (!asking) return;
    const target = asking;
    setAsking(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    run('ask', () => askBuddy(target.user_id, askText.trim() || undefined), `Asked ${first(target)} 💛`);
  };

  const confirmEnd = (pair: BuddyPair, asNewcomer: boolean) => {
    const other = asNewcomer ? pair.buddy : pair.newcomer;
    const asked = pair.status === 'asked';
    warmAlert(
      asked ? `Take back your ask?` : `End your buddy time with ${first(other)}?`,
      asked ? `${first(other)} won't see it anymore.` : "You can always keep chatting — this just ends the buddy pairing.",
      [
        { text: asked ? 'Take it back' : 'End buddy pairing', style: 'destructive', onPress: () => run('end', () => endBuddy(pair.id)) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  if (failed && !state) return <ErrorState onRetry={load} />;

  const volunteering = !!state?.volunteer;

  return (
    <View style={styles.flex}>
      <ScrollView
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
      >
        <FadeInView>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={20} color={colors.textDark} accessibilityLabel="Back" />
          </TouchableOpacity>
          <Text style={styles.title}>Buddies</Text>
          <Text style={styles.intro}>A classmate to walk your first weeks with — someone to sit with, ask anything, and find your way.</Text>
        </FadeInView>

        {!state ? <ActivityIndicator color={colors.primaryDark} style={{ marginTop: spacing.xl }} /> : null}

        {/* Someone asked me. */}
        {state?.incoming.map((pair) => (
          <FadeInView key={pair.id} style={[styles.card, styles.cardWarm]}>
            <View style={styles.personRow}>
              <Avatar uri={pair.newcomer?.avatar_url ?? null} size={48} />
              <View style={styles.flex1}>
                <Text style={styles.cardTitle}>{pair.newcomer?.full_name ?? 'A classmate'} would love a buddy</Text>
                <Text style={styles.cardSub}>{pair.newcomer?.grade ? `${pair.newcomer.grade} grade · ` : ''}new to your school</Text>
              </View>
            </View>
            {pair.message ? <Text style={styles.quote}>“{pair.message}”</Text> : null}
            <View style={styles.actions}>
              <PrimaryButton
                title="Be their buddy"
                size="sm"
                loading={busy === `yes-${pair.id}`}
                onPress={() => run(`yes-${pair.id}`, () => respondBuddy(pair.id, true), `You're ${first(pair.newcomer)}'s buddy 💛`)}
                style={styles.flex1}
              />
              <PrimaryButton title="Not right now" size="sm" variant="outline" onPress={() => run(`no-${pair.id}`, () => respondBuddy(pair.id, false))} style={styles.flex1} />
            </View>
          </FadeInView>
        ))}

        {/* My buddy, or my waiting ask. */}
        {state?.mine ? (
          <FadeInView style={[styles.card, state.mine.status === 'active' && styles.cardWarm]}>
            <Text style={styles.label}>{state.mine.status === 'active' ? 'Your buddy' : 'Waiting to hear back'}</Text>
            <View style={styles.personRow}>
              <Avatar uri={state.mine.buddy?.avatar_url ?? null} size={52} />
              <View style={styles.flex1}>
                <Text style={styles.cardTitle}>{state.mine.buddy?.full_name ?? 'Your buddy'}</Text>
                <Text style={styles.cardSub}>
                  {state.mine.status === 'active' ? "They're here to help you settle in 💛" : `We let ${first(state.mine.buddy)} know you asked.`}
                </Text>
              </View>
            </View>
            {state.mine.status === 'active' ? (
              <PrimaryButton title={`Message ${first(state.mine.buddy)}`} icon="chatbubble-ellipses-outline" onPress={() => openChat(state.mine!.buddy)} style={styles.mainButton} />
            ) : null}
            <TouchableOpacity onPress={() => confirmEnd(state.mine!, true)} style={styles.quietLink}>
              <Text style={styles.quietLinkText}>{state.mine.status === 'active' ? 'End buddy pairing' : 'Take back my ask'}</Text>
            </TouchableOpacity>
          </FadeInView>
        ) : state ? (
          <FadeInView delay={40}>
            <Text style={styles.section}>Find a buddy</Text>
            {state.recentlyDeclined ? (
              <Text style={styles.note}>{first(state.recentlyDeclined.buddy)} can't be a buddy right now — that's okay. Try someone else below.</Text>
            ) : null}
            {suggestions.length === 0 ? (
              <View style={styles.card}>
                <NSIcon name="sprout" size={32} />
                <Text style={styles.cardTitle}>No buddies at your school yet</Text>
                <Text style={styles.cardSub}>Be the first — say you're happy to be one below. You can also ask a question on Home anytime.</Text>
              </View>
            ) : (
              suggestions.map((s, i) => (
                <FadeInView key={s.user_id} delay={Math.min(i, 5) * 40} style={styles.card}>
                  <View style={styles.personRow}>
                    <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: s.user_id })}>
                      <Avatar uri={s.avatar_url} size={48} />
                    </TouchableOpacity>
                    <View style={styles.flex1}>
                      <Text style={styles.cardTitle}>{s.full_name ?? 'Classmate'}</Text>
                      <Text style={styles.cardSub}>
                        {[s.grade ? `${s.grade} grade` : null, s.helped_count > 0 ? `buddy to ${s.helped_count} before` : null].filter(Boolean).join(' · ') || 'Happy to help'}
                      </Text>
                    </View>
                    <PrimaryButton
                      title="Ask"
                      size="sm"
                      style={styles.smallButton}
                      onPress={() => {
                        setAskText(DEFAULT_ASK);
                        setAsking(s);
                      }}
                    />
                  </View>
                  {s.intro ? <Text style={styles.quote}>“{s.intro}”</Text> : null}
                  {s.shared_interests.length > 0 ? (
                    <View style={styles.chips}>
                      <Text style={styles.chipsLabel}>You both like</Text>
                      {s.shared_interests.slice(0, 3).map((t) => (
                        <View key={t} style={styles.chip}>
                          <Text style={styles.chipText}>{t}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </FadeInView>
              ))
            )}
          </FadeInView>
        ) : null}

        {/* Students I'm a buddy for. */}
        {state && state.helping.length > 0 ? (
          <FadeInView>
            <Text style={styles.section}>You're a buddy for</Text>
            {state.helping.map((pair) => (
              <View key={pair.id} style={[styles.card, styles.personRow]}>
                <Avatar uri={pair.newcomer?.avatar_url ?? null} size={44} />
                <View style={styles.flex1}>
                  <Text style={styles.cardTitle}>{pair.newcomer?.full_name ?? 'Classmate'}</Text>
                  <TouchableOpacity onPress={() => confirmEnd(pair, false)}>
                    <Text style={styles.quietLinkText}>End pairing</Text>
                  </TouchableOpacity>
                </View>
                <PrimaryButton title="Say hi" size="sm" variant="outline" icon="chatbubble-ellipses-outline" onPress={() => openChat(pair.newcomer)} style={styles.smallButton} />
              </View>
            ))}
          </FadeInView>
        ) : null}

        {/* Offer to be one. */}
        {state ? (
          <FadeInView delay={80}>
            <Text style={styles.section}>Be a buddy</Text>
            <View style={[styles.card, volunteering && styles.cardOn]}>
              <TouchableOpacity
                style={styles.toggleRow}
                activeOpacity={0.8}
                disabled={busy === 'vol'}
                onPress={() =>
                  volunteering
                    ? run('vol', () => setBuddyVolunteer(false), 'You’re off the buddy list')
                    : run('vol', () => setBuddyVolunteer(true, intro), "You're on the buddy list 💛")
                }
                accessibilityRole="switch"
                accessibilityState={{ checked: volunteering }}
              >
                <View style={styles.flex1}>
                  <Text style={styles.cardTitle}>I'm happy to be a buddy</Text>
                  <Text style={styles.cardSub}>Only students at your school can ask, up to 3 at a time, and you can always say not right now.</Text>
                </View>
                <View style={[styles.toggle, volunteering && styles.toggleOn]}>
                  <View style={[styles.knob, volunteering && styles.knobOn]} />
                </View>
              </TouchableOpacity>
              {volunteering ? (
                editingIntro ? (
                  <View style={styles.introEdit}>
                    <TextInput
                      style={styles.input}
                      value={intro}
                      onChangeText={setIntro}
                      maxLength={140}
                      placeholder="e.g. Junior, on the soccer team — ask me about clubs!"
                      placeholderTextColor={colors.textLight}
                      multiline
                    />
                    <PrimaryButton
                      title="Save"
                      size="sm"
                      loading={busy === 'intro'}
                      onPress={() => {
                        setEditingIntro(false);
                        run('intro', () => setBuddyVolunteer(true, intro), 'Saved');
                      }}
                    />
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setEditingIntro(true)} style={styles.introRow}>
                    <Text style={[styles.quote, !state.volunteer?.intro && styles.placeholder]}>
                      {state.volunteer?.intro ? `“${state.volunteer.intro}”` : 'Add a line about you, so new students know who you are'}
                    </Text>
                    <Ionicons name="create-outline" size={16} color={colors.textLight} />
                  </TouchableOpacity>
                )
              ) : null}
            </View>
          </FadeInView>
        ) : null}
      </ScrollView>

      {/* Ask sheet */}
      <Modal visible={!!asking} transparent animationType="slide" onRequestClose={() => setAsking(null)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setAsking(null)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.handle} />
            <View style={styles.sheetHead}>
              <Avatar uri={asking?.avatar_url ?? null} size={56} />
              <Text style={styles.sheetTitle}>Ask {first(asking)} to be your buddy</Text>
              <Text style={styles.cardSub}>They'll get your note and can say yes or not right now.</Text>
            </View>
            <TextInput style={[styles.input, styles.sheetInput]} value={askText} onChangeText={setAskText} maxLength={200} multiline />
            <PrimaryButton title="Send" icon="heart" onPress={sendAsk} loading={busy === 'ask'} style={styles.mainButton} />
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
  flex1: {
    flex: 1,
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
    marginBottom: spacing.md,
  },
  section: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginLeft: 4,
  },
  note: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginBottom: spacing.sm,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cardWarm: {
    backgroundColor: '#FFF6E6',
    borderColor: '#F6DFB4',
  },
  cardOn: {
    borderColor: colors.primary,
  },
  label: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
    color: colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  cardSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: 2,
  },
  quote: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.textDark,
  },
  placeholder: {
    color: colors.textLight,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  chipsLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  chip: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  chipText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.primaryDark,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  // Fixed width so a short label never gets squeezed by the name beside it.
  smallButton: {
    minWidth: 116,
    paddingHorizontal: spacing.md,
  },
  mainButton: {
    marginTop: spacing.sm,
  },
  quietLink: {
    alignSelf: 'center',
    paddingVertical: 4,
  },
  quietLinkText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textLight,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
    padding: 3,
  },
  toggleOn: {
    backgroundColor: colors.primary,
  },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
  knobOn: {
    transform: [{ translateX: 20 }],
  },
  introRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  introEdit: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textDark,
    minHeight: 64,
    textAlignVertical: 'top',
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
  sheetHead: {
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontFamily: fontFamily.brand,
    fontSize: 22,
    color: colors.textDark,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  sheetInput: {
    minHeight: 90,
  },
});
