import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
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
import {
  fetchLanternNotes,
  addLanternNote,
  setLanternNoteHidden,
  deleteMyLanternNote,
  deleteMyLantern,
  reportLantern,
  toggleLanternHug,
  markLanternNoteHelped,
  LanternNote,
  NOTE_MAX,
  NOTE_STARTERS,
} from '../../lib/lanterns';
import { hasBlockedWords, KIND_WORDS_MESSAGE } from '../../lib/contentFilter';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import SupportLines from '../../components/SupportLines';
import LanternBackdrop from '../../components/LanternBackdrop';
import { useWarmSheet } from '../../components/WarmSheet';
import { LanternGlyph } from './LanternsScreen';
import { colors, spacing, fontSize, fontFamily } from '../../constants/theme';
import { MainStackParamList } from '../../types';
import { errorMessage } from '../../lib/errors';

// One lantern and the warm notes sent to it. Notes carry the sender's name;
// there are no replies to replies. The lantern's writer can hide a note.

export default function LanternDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { lanternId, text, mine, crisis, createdAt, hugCount = 0, huggedByMe = false } =
    useRoute<RouteProp<MainStackParamList, 'LanternDetail'>>().params;
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [notes, setNotes] = useState<LanternNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [hugs, setHugs] = useState(hugCount);
  const [hugged, setHugged] = useState(huggedByMe);
  const { ask, sheet } = useWarmSheet();

  const load = useCallback(async () => {
    try {
      setNotes(await fetchLanternNotes(lanternId));
    } catch {
      showToast("Couldn't load the notes");
    } finally {
      setLoading(false);
    }
  }, [lanternId, showToast]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSend = async () => {
    const t = draft.trim();
    if (!t || sending) return;
    if (hasBlockedWords(t)) {
      showToast(KIND_WORDS_MESSAGE);
      return;
    }
    setSending(true);
    try {
      await addLanternNote(lanternId, t);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDraft('');
      showToast('Your warm note is on its way 💛');
      await load();
    } catch (err) {
      showToast(errorMessage(err, "Couldn't send the note"));
    } finally {
      setSending(false);
    }
  };

  const run = (fn: () => Promise<void>) => () => {
    fn().catch((e) => showToast(e?.message ?? 'Something went wrong'));
  };

  const noteMenu = (n: LanternNote) => {
    if (n.mine) {
      ask({
        title: 'Delete your note?',
        actions: [{ label: 'Delete', danger: true, onPress: run(async () => { await deleteMyLanternNote(n.id); await load(); }) }],
      });
    } else if (mine) {
      ask({
        title: 'This note',
        message: n.hidden ? 'Only you can see it right now.' : undefined,
        actions: [
          { label: n.hidden ? 'Show it again' : 'Hide this note', onPress: run(async () => { await setLanternNoteHidden(n.id, !n.hidden); await load(); }) },
          { label: 'Report', danger: true, onPress: run(async () => { await reportLantern({ noteId: n.id }); showToast('Reported — thank you 💛'); await load(); }) },
        ],
      });
    } else {
      ask({
        title: 'Report this note?',
        message: "It'll be hidden for you and sent for review.",
        actions: [{ label: 'Report', danger: true, onPress: run(async () => { await reportLantern({ noteId: n.id }); showToast('Reported — thank you 💛'); await load(); }) }],
      });
    }
  };

  const lanternMenu = () => {
    if (mine) {
      ask({
        emoji: '🏮',
        title: 'Let this lantern go?',
        message: 'It and its notes will drift away for good.',
        actions: [{ label: 'Let it go', danger: true, onPress: run(async () => { await deleteMyLantern(lanternId); navigation.goBack(); }) }],
      });
    } else {
      ask({
        title: 'Report this lantern?',
        message: "It'll be hidden for you and sent for review.",
        actions: [{ label: 'Report', danger: true, onPress: run(async () => { await reportLantern({ lanternId }); showToast('Reported — thank you 💛'); navigation.goBack(); }) }],
      });
    }
  };

  // "Me too": a quiet way to say "I feel this too", no words needed.
  const handleHug = async () => {
    const next = !hugged;
    setHugged(next);
    setHugs((h) => h + (next ? 1 : -1));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const now = await toggleLanternHug(lanternId);
      if (now !== next) {
        setHugged(now);
        setHugs((h) => h + (now ? 1 : -1) - (next ? 1 : -1));
      }
    } catch (e) {
      setHugged(!next);
      setHugs((h) => h - (next ? 1 : -1));
      showToast(errorMessage(e, "Couldn't do that"));
    }
  };

  // The lantern's writer tells a classmate their note helped.
  const handleHelped = async (n: LanternNote) => {
    setNotes((all) => all.map((x) => (x.id === n.id ? { ...x, helped: true } : x)));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await markLanternNoteHelped(n.id);
      showToast(`We let ${n.author_name?.split(' ')[0] ?? 'them'} know it helped 💛`);
    } catch (e) {
      setNotes((all) => all.map((x) => (x.id === n.id ? { ...x, helped: false } : x)));
      showToast(errorMessage(e, "Couldn't do that"));
    }
  };

  const alreadySent = notes.some((n) => n.mine);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar style="light" />
      <LanternBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={20} color={colors.warm.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={lanternMenu} style={styles.iconButton} accessibilityLabel={mine ? 'Let this lantern go' : 'Report this lantern'}>
          <Ionicons name={mine ? 'trash-outline' : 'flag-outline'} size={18} color={colors.warm.creamMuted} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={notes}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.lantern}>
            <LanternGlyph size={40} />
            <View style={styles.lanternPaper}>
            <Text style={styles.lanternWho}>
              {mine ? 'Your lantern' : 'Someone at your school'} · {formatRelativeTime(createdAt)}
            </Text>
            <Text style={styles.lanternText}>{text}</Text>
            </View>
            {mine ? (
              hugs > 0 ? (
                <Text style={styles.hugInfo}>
                  🫂 {hugs} {hugs === 1 ? 'classmate feels' : 'classmates feel'} the same way
                </Text>
              ) : null
            ) : (
              <TouchableOpacity
                style={[styles.hug, hugged && styles.hugOn]}
                onPress={handleHug}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: hugged }}
                accessibilityLabel={hugged ? 'You said me too. Tap to take it back' : 'Me too'}
              >
                <Text style={[styles.hugText, hugged && styles.hugTextOn]}>
                  🫂 {hugged ? 'You feel it too' : 'Me too'}
                  {hugs > 0 ? `  ·  ${hugs}` : ''}
                </Text>
              </TouchableOpacity>
            )}
            {crisis ? (
              <View style={{ alignSelf: 'stretch', marginTop: spacing.sm }}>
                <SupportLines compact={!mine} />
              </View>
            ) : null}
            <Text style={styles.section}>
              {loading ? ' ' : notes.length ? `💛 ${notes.length} warm ${notes.length === 1 ? 'note' : 'notes'}` : mine ? 'Warm notes will show up here' : 'No notes yet — yours could be the first'}
            </Text>
          </View>
        }
        ListEmptyComponent={loading ? <ActivityIndicator color={colors.warm.honey} /> : null}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.note, item.hidden && styles.noteHidden]}
            onLongPress={() => noteMenu(item)}
            onPress={() => item.author_id && !item.mine && navigation.navigate('UserProfile', { userId: item.author_id })}
            activeOpacity={0.85}
          >
            <Avatar uri={item.author_avatar} size={34} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.noteName}>
                {item.mine ? 'You' : item.author_name ?? 'A classmate'}
                <Text style={styles.noteTime}>  {formatRelativeTime(item.created_at)}</Text>
                {item.hidden ? <Text style={styles.noteTime}>  · hidden</Text> : null}
              </Text>
              <Text style={styles.noteText}>{item.text}</Text>
              {item.helped ? (
                <Text style={styles.helpedBadge}>💛 {item.mine ? 'This helped them' : 'This helped'}</Text>
              ) : mine && !item.mine ? (
                <TouchableOpacity style={styles.helpedButton} onPress={() => handleHelped(item)} activeOpacity={0.85}>
                  <Ionicons name="heart-outline" size={13} color={colors.warm.honey} />
                  <Text style={styles.helpedButtonText}>This helped</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => noteMenu(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Note options">
              <Ionicons name="ellipsis-horizontal" size={16} color={colors.warm.creamFaint} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />

      {!mine ? (
        <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
          {!draft && !alreadySent ? (
            <FlatList
              horizontal
              data={NOTE_STARTERS}
              keyExtractor={(s) => s}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.starters}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.starter} onPress={() => setDraft(item)}>
                  <Text style={styles.starterText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          ) : null}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Send a warm note (with your name)"
              placeholderTextColor={colors.warm.creamFaint}
              value={draft}
              onChangeText={setDraft}
              maxLength={NOTE_MAX}
              multiline
            />
            <TouchableOpacity
              style={[styles.send, !draft.trim() && { opacity: 0.4 }]}
              onPress={handleSend}
              disabled={!draft.trim() || sending}
              accessibilityLabel="Send warm note"
            >
              {sending ? <ActivityIndicator size="small" color={colors.warm.honeyInk} /> : <Ionicons name="heart" size={18} color={colors.warm.honeyInk} />}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      {sheet}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#1B1426',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  lantern: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  lanternPaper: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFF1DE',
    borderRadius: 24,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  lanternWho: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: '#B07A4A',
  },
  lanternText: {
    fontFamily: fontFamily.regular,
    fontSize: 18,
    lineHeight: 27,
    color: '#4A2E1E',
    textAlign: 'center',
  },
  hug: {
    marginTop: spacing.sm,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(245,194,122,0.4)',
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  hugOn: {
    backgroundColor: colors.warm.honey,
    borderColor: colors.warm.honey,
  },
  hugText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.warm.cream,
  },
  hugTextOn: {
    color: colors.warm.honeyInk,
  },
  hugInfo: {
    marginTop: spacing.sm,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.warm.creamMuted,
  },
  helpedBadge: {
    marginTop: 4,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.warm.honey,
  },
  helpedButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,194,122,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  helpedButtonText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.warm.honey,
  },
  section: {
    alignSelf: 'flex-start',
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.warm.creamMuted,
    marginTop: spacing.lg,
  },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(52,34,48,0.92)',
    borderRadius: 18,
    padding: spacing.sm + 4,
  },
  noteHidden: {
    opacity: 0.45,
  },
  noteName: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.warm.cream,
  },
  noteTime: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.warm.creamFaint,
  },
  noteText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    lineHeight: 21,
    color: colors.warm.cream,
  },
  composer: {
    backgroundColor: 'rgba(48,28,36,0.95)',
    borderTopWidth: 1,
    borderTopColor: colors.warm.line,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  starters: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  starter: {
    backgroundColor: 'rgba(245,194,122,0.12)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  starterText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.warm.cream,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    backgroundColor: colors.warm.glassSoft,
    borderRadius: 22,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    maxHeight: 110,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.warm.cream,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.warm.honey,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
