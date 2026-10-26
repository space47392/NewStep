import { Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MoodFace from './MoodFace';
import PrimaryButton from './PrimaryButton';
import { LanternGlyph } from '../screens/main/LanternsScreen';
import { SkyDiaryDay, SkyMood, skyMood } from '../lib/sky';
import { colors, fontFamily, fontSize, radius, spacing } from '../constants/theme';

// A gentle moment after a heavy star goes up. Two kinds:
//  - 'streak': several heavy days in a row → a soft nudge to talk to
//    someone they trust (only they ever see this).
//  - 'memory': a heavy day → a note they wrote on a better day, so the
//    comfort comes from themselves.

export type Care =
  | { kind: 'streak'; days: number; mood: SkyMood }
  | { kind: 'memory'; entry: SkyDiaryDay };

const HEAVY: SkyMood[] = ['down', 'nervous'];
const BRIGHT: SkyMood[] = ['happy', 'excited', 'chill'];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// What (if anything) to offer, from the newest-first diary and today's mood.
export function careFor(diary: SkyDiaryDay[], todayMood: SkyMood): Care | null {
  if (!HEAVY.includes(todayMood)) return null;
  const byDay = new Map(diary.map((e) => [e.day, e]));
  // Heavy days in a row, counting back from today.
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 14; i++) {
    const e = i === 0 ? { mood: todayMood } : byDay.get(dayKey(d));
    if (!e || !HEAVY.includes(e.mood as SkyMood)) break;
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  if (streak >= 3) return { kind: 'streak', days: streak, mood: todayMood };
  const today = dayKey(new Date());
  const good = diary.find((e) => e.day !== today && BRIGHT.includes(e.mood) && e.note && e.note.trim().length >= 3);
  return good ? { kind: 'memory', entry: good } : null;
}

type Props = {
  care: Care | null;
  onClose: () => void;
  onBreathe: () => void;
  onLantern: () => void;
};

export default function CareSheet({ care, onClose, onBreathe, onLantern }: Props) {
  const insets = useSafeAreaInsets();
  if (!care) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          {care.kind === 'streak' ? (
            <>
              <View style={styles.glow}>
                <LanternGlyph size={34} />
              </View>
              <Text style={styles.title}>It's been a heavy few days</Text>
              <Text style={styles.body}>
                You've felt {skyMood(care.mood).label.toLowerCase()} {care.days} days in a row. That's a lot to carry on your own. Talking to someone you trust, like a school counselor, a teacher or someone at home, can really help.
              </Text>
              <Text style={styles.private}>
                <Ionicons name="lock-closed" size={11} color={colors.textLight} /> Only you can see this.
              </Text>
              <PrimaryButton title="Take a 1-minute breath" icon="leaf-outline" onPress={onBreathe} style={styles.main} />
              <PrimaryButton title="Send a lantern, no name" variant="outline" onPress={onLantern} style={styles.second} />
              <TouchableOpacity onPress={() => Linking.openURL('tel:988').catch(() => {})} style={styles.lineRow}>
                <Text style={styles.lineText}>
                  Need to talk now? <Text style={styles.lineLink}>Call or text 988</Text> · Korea 109 · Teens 1388
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.kicker}>A note from a better day</Text>
              <View style={styles.memory}>
                <View style={styles.memoryHead}>
                  <MoodFace mood={care.entry.mood} size={26} />
                  <Text style={styles.memoryDate}>
                    {new Date(care.entry.day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} · you felt{' '}
                    {skyMood(care.entry.mood).label.toLowerCase()}
                  </Text>
                </View>
                <Text style={styles.memoryNote}>“{care.entry.note}”</Text>
              </View>
              <Text style={styles.body}>Hard days pass. You've had good ones, and you'll have them again.</Text>
              <PrimaryButton title="Thanks 💛" onPress={onClose} style={styles.main} />
              <PrimaryButton title="Take a 1-minute breath" variant="outline" icon="leaf-outline" onPress={onBreathe} style={styles.second} />
            </>
          )}
          {care.kind === 'streak' ? (
            <TouchableOpacity onPress={onClose} style={styles.later} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.laterText}>I'm okay for now</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    marginBottom: spacing.lg,
  },
  glow: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fontFamily.brand,
    fontSize: 24,
    color: colors.textDark,
    textAlign: 'center',
  },
  kicker: {
    fontFamily: fontFamily.brand,
    fontSize: 22,
    color: colors.textDark,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    lineHeight: 23,
    color: colors.textMid,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  private: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  memory: {
    backgroundColor: '#FFF6E6',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#F6DFB4',
    padding: spacing.md,
    gap: spacing.sm,
  },
  memoryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  memoryDate: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  memoryNote: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.lg,
    lineHeight: 26,
    color: colors.textDark,
  },
  main: {
    marginTop: spacing.lg,
  },
  second: {
    marginTop: spacing.sm,
  },
  lineRow: {
    marginTop: spacing.md,
    alignSelf: 'center',
  },
  lineText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    textAlign: 'center',
  },
  lineLink: {
    fontFamily: fontFamily.semibold,
    color: colors.primaryDark,
  },
  later: {
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  laterText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
});
