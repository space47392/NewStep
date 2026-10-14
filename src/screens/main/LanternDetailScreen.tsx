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
  Alert,
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
  LanternNote,
  NOTE_MAX,
  NOTE_STARTERS,
} from '../../lib/lanterns';
import { hasBlockedWords, KIND_WORDS_MESSAGE } from '../../lib/contentFilter';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import SupportLines from '../../components/SupportLines';
import { LanternGlyph } from './LanternsScreen';
import { colors, spacing, fontSize, fontFamily } from '../../constants/theme';
import { MainStackParamList } from '../../types';

// One lantern and the warm notes sent to it. Notes carry the sender's name;
// there are no replies to replies. The lantern's writer can hide a note.

export default function LanternDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { lanternId, text, mine, crisis, createdAt } = useRoute<RouteProp<MainStackParamList, 'LanternDetail'>>().params;
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [notes, setNotes] = useState<LanternNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

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
      showToast(err instanceof Error ? err.message : "Couldn't send the note");
    } finally {
      setSending(false);
    }
  };

  const confirm = (title: string, message: string, action: string, run: () => Promise<void>, destructive = true) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: action, style: destructive ? 'destructive' : 'default', onPress: () => run().catch((e) => showToast(e?.message ?? 'Something went wrong')) },
    ]);

  const noteMenu = (n: LanternNote) => {
    if (n.mine) {
      confirm('Delete your note?', '', 'Delete', async () => {
        await deleteMyLanternNote(n.id);
        await load();
      });
    } else if (mine) {
      Alert.alert('This note', '', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: n.hidden ? 'Show it again' : 'Hide this note',
          onPress: async () => {
            await setLanternNoteHidden(n.id, !n.hidden).catch(() => showToast("Couldn't change that"));
            await load();
          },
        },
        {
          text: 'Report',
          style: 'destructive',
          onPress: async () => {
            await reportLantern({ noteId: n.id }).catch(() => {});
            showToast('Reported — thank you 💛');
            await load();
          },
        },
      ]);
    } else {
      confirm('Report this note?', "It'll be hidden for you and sent for review.", 'Report', async () => {
        await reportLantern({ noteId: n.id });
        showToast('Reported — thank you 💛');
        await load();
      });
    }
  };

  const lanternMenu = () => {
    if (mine) {
      confirm('Let this lantern go?', 'It and its notes will be removed.', 'Let it go', async () => {
        await deleteMyLantern(lanternId);
        navigation.goBack();
      });
    } else {
      confirm('Report this lantern?', "It'll be hidden for you and sent for review.", 'Report', async () => {
        await reportLantern({ lanternId });
        showToast('Reported — thank you 💛');
        navigation.goBack();
      });
    }
  };

  const alreadySent = notes.some((n) => n.mine);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar style="light" />
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
            <Text style={styles.lanternWho}>
              {mine ? 'Your lantern' : 'Someone at your school'} · {formatRelativeTime(createdAt)}
            </Text>
            <Text style={styles.lanternText}>{text}</Text>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#15111F',
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
  lanternWho: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.warm.honey,
    marginTop: spacing.sm,
  },
  lanternText: {
    fontFamily: fontFamily.regular,
    fontSize: 18,
    lineHeight: 27,
    color: colors.warm.cream,
    textAlign: 'center',
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
    backgroundColor: colors.warm.glassSoft,
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
