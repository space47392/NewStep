import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { describeSky, fetchSchoolSky, setMyStar, SKY_MOODS, SkyMood } from '../lib/sky';
import { skyPhase } from './SkyScene';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';

// "Look up — how's the sky right now?" Asked inside the app once each part
// of the day (morning, afternoon, evening, night) if you haven't told us
// yet, so people keep noticing the real sky. One tap paints your star's sky
// in School Sky; if you have no star today it asks how you are too.

type Slot = 'morning' | 'afternoon' | 'evening' | 'night';

function currentSlot(d = new Date()): Slot {
  const h = d.getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

function slotKey(userId: string, d = new Date()) {
  const day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  return `skycheck:${userId}:${day}:${currentSlot(d)}`;
}

const DAY_SKIES = [
  { label: '☀️ Clear blue', text: 'clear blue sky' },
  { label: '⛅ A few clouds', text: 'blue sky with a few fluffy clouds' },
  { label: '☁️ Cloudy', text: 'grey cloudy sky' },
  { label: '🌧 Rainy', text: 'rainy grey sky' },
  { label: '🌫 Foggy', text: 'foggy hazy sky' },
  { label: '🌈 Rainbow', text: 'rainbow after rain' },
];
const EVENING_SKIES = [
  { label: '🌅 Sunset glow', text: 'pink and orange sunset' },
  { label: '🔥 Fiery', text: 'red fiery sunset' },
  { label: '💜 Purple dusk', text: 'purple dusk sky' },
  { label: '☁️ Cloudy', text: 'grey cloudy sky' },
  { label: '🌧 Rainy', text: 'rainy grey sky' },
  { label: '🌙 Moon is out', text: 'moon in the evening sky' },
];
const NIGHT_SKIES = [
  { label: '✨ Starry', text: 'clear night full of stars' },
  { label: '🌙 Moon', text: 'moon in the night sky' },
  { label: '☁️ Cloudy night', text: 'cloudy night sky' },
  { label: '🌧 Rainy night', text: 'rainy night' },
  { label: '🌫 Foggy', text: 'foggy night' },
  { label: '🌌 Deep dark', text: 'dark night sky' },
];

function skiesFor(slot: Slot) {
  if (slot === 'evening') return EVENING_SKIES;
  if (slot === 'night') return NIGHT_SKIES;
  return DAY_SKIES;
}

type Props = {
  userId: string | undefined;
  // Only ask students who are in a school (School Sky is per school).
  enabled: boolean;
  onShared?: () => void;
  onOpenSky: () => void;
};

export default function SkyCheckSheet({ userId, enabled, onShared, onOpenSky }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [sky, setSky] = useState<{ label: string; text: string } | null>(null);
  const [needsMood, setNeedsMood] = useState(false);
  const [existing, setExisting] = useState<{ mood: SkyMood; note: string | null; photo: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const slot = currentSlot();

  // Decide whether to ask: not yet asked this part of the day, and your
  // star's sky hasn't been described since it began.
  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        if (await AsyncStorage.getItem(slotKey(userId))) return;
        const stars = await fetchSchoolSky(60).catch(() => []);
        const mine = stars.find((s) => s.user_id === userId) ?? null;
        if (mine) {
          setExisting({ mood: mine.mood, note: mine.note, photo: mine.photo_url });
          const updated = new Date(mine.updated_at);
          if (mine.sky_desc && currentSlot(updated) === currentSlot() && updated.toDateString() === new Date().toDateString()) return;
        }
        if (!cancelled) setOpen(true);
      } catch {
        // storage unavailable — just don't ask
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [enabled, userId]);

  const remember = useCallback(() => {
    if (userId) AsyncStorage.setItem(slotKey(userId), '1').catch(() => {});
  }, [userId]);

  const close = () => {
    remember();
    setOpen(false);
    setSky(null);
    setNeedsMood(false);
  };

  const save = async (choice: { label: string; text: string }, mood: SkyMood) => {
    setSaving(true);
    try {
      const scene = await describeSky(choice.text, skyPhase());
      await setMyStar({
        mood,
        note: existing?.note ?? '',
        photoUrl: existing?.photo ?? null,
        skyColors: null,
        desc: scene ? choice.text : null,
        scene,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      remember();
      setOpen(false);
      setSky(null);
      setNeedsMood(false);
      onShared?.();
    } catch {
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  const pickSky = (choice: { label: string; text: string }) => {
    setSky(choice);
    if (existing) save(choice, existing.mood);
    else setNeedsMood(true);
  };

  if (!enabled) return null;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} accessibilityLabel="Not now" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.eyes}>👀</Text>
          <Text style={styles.title}>{needsMood ? 'And how are you?' : 'Look up for a second'}</Text>
          <Text style={styles.sub}>
            {needsMood ? `${sky?.label} — got it. One more tap and your star is up.` : "How's the sky right now?"}
          </Text>

          {saving ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
          ) : needsMood ? (
            <View style={styles.grid}>
              {SKY_MOODS.map((m) => (
                <TouchableOpacity key={m.key} style={styles.mood} onPress={() => sky && save(sky, m.key)} activeOpacity={0.85}>
                  <Text style={styles.moodEmoji}>{m.emoji}</Text>
                  <Text style={styles.moodLabel}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.grid}>
              {skiesFor(slot).map((c) => (
                <TouchableOpacity key={c.label} style={styles.chip} onPress={() => pickSky(c)} activeOpacity={0.85}>
                  <Text style={styles.chipText}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.footer}>
            <TouchableOpacity
              onPress={() => {
                close();
                onOpenSky();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.link}>Describe it in my own words</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.later}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,14,8,0.35)',
  },
  sheet: {
    backgroundColor: colors.cardBg,
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
  eyes: {
    fontSize: 30,
    textAlign: 'center',
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xl,
    color: colors.textDark,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  sub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textMid,
    textAlign: 'center',
    marginTop: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  chip: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chipText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  mood: {
    width: 76,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
  },
  moodEmoji: {
    fontSize: 28,
  },
  moodLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textMid,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  link: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primaryDark,
  },
  later: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
});
