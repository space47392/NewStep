import { useCallback, useState } from 'react';
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useToast } from '../../contexts/ToastContext';
import { fetchLanterns, sendLantern, soundsLikeCrisis, Lantern, LANTERN_MAX } from '../../lib/lanterns';
import { hasBlockedWords, KIND_WORDS_MESSAGE } from '../../lib/contentFilter';
import { formatRelativeTime } from '../../lib/time';
import SkyScene from '../../components/SkyScene';
import PrimaryButton from '../../components/PrimaryButton';
import SupportLines from '../../components/SupportLines';
import { colors, spacing, fontSize, fontFamily } from '../../constants/theme';
import { MainStackParamList } from '../../types';

// Lanterns: a quiet place in School Sky to send up a worry without your
// name, and to send warm notes to classmates who did.

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

export default function LanternsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
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

  const doSend = async () => {
    setSending(true);
    try {
      await sendLantern(text);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setComposeOpen(false);
      setShowSupport(false);
      setText('');
      showToast('Your lantern is up 🏮 Classmates can send you warm notes.');
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't send the lantern");
    } finally {
      setSending(false);
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

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SkyScene phase="night" />
      <View style={styles.dim} pointerEvents="none" />

      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={20} color={colors.warm.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Lanterns</Text>
          <Text style={styles.subtitle}>Let a worry float up. Someone will send warmth back.</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.warm.honey} style={{ marginTop: spacing.xxl }} />
      ) : (
        <FlatList
          data={lanterns}
          keyExtractor={(l) => l.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 120 }]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <LanternGlyph size={44} />
              <Text style={styles.emptyTitle}>No lanterns tonight</Text>
              <Text style={styles.emptySub}>
                If something's weighing on you, you can send it up here without your name. Classmates can only send kindness back.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('LanternDetail', { lanternId: item.id, text: item.text, mine: item.mine, crisis: item.crisis, createdAt: item.created_at })}
              accessibilityRole="button"
              accessibilityLabel={`A lantern: ${item.text}`}
            >
              <View style={styles.cardTop}>
                <LanternGlyph size={20} />
                <Text style={styles.cardWho}>{item.mine ? 'Your lantern' : 'Someone at your school'}</Text>
                <Text style={styles.cardTime}>{formatRelativeTime(item.created_at)}</Text>
              </View>
              <Text style={styles.cardText} numberOfLines={4}>
                {item.text}
              </Text>
              <Text style={styles.cardNotes}>
                {item.note_count > 0
                  ? `💛 ${item.note_count} warm ${item.note_count === 1 ? 'note' : 'notes'}`
                  : item.mine
                    ? 'Waiting for warm notes…'
                    : 'Be the first to send warmth'}
                {item.noted_by_me ? '  ·  you sent one' : ''}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.md }]}>
        <PrimaryButton variant="warm" title="Send up a lantern" icon="flame-outline" onPress={() => setComposeOpen(true)} />
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
              <Text style={styles.sheetTitle}>What's on your mind?</Text>
              <Text style={styles.sheetSub}>
                Your name won't be shown. Only classmates at your school see it, and it fades after 3 days.
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
              <Text style={styles.count}>
                {text.length}/{LANTERN_MAX}
              </Text>
              <PrimaryButton
                variant="warm"
                title={showSupport ? 'Send my lantern too' : 'Send it up'}
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  dim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(12,9,22,0.35)',
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
    paddingTop: spacing.md,
    gap: spacing.sm + 4,
  },
  card: {
    backgroundColor: colors.warm.glass,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.warm.line,
    padding: spacing.md,
    gap: spacing.sm,
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
  cardNotes: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.warm.creamMuted,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.lg,
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
    backgroundColor: 'rgba(14,11,26,0.85)',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(12,9,20,0.5)',
  },
  sheet: {
    backgroundColor: '#1E1928',
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
