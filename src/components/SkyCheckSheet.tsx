import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { describeSky, fetchSchoolSky, setMyStar, SKY_MOODS, SkyMood, SkyScene } from '../lib/sky';
import { interpretSky } from '../lib/skyInterpret';
import { skyPhase } from './SkyScene';
import PrimaryButton from './PrimaryButton';
import NSIcon from './NSIcon';
import { LanternGlyph } from '../screens/main/LanternsScreen';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';

// "Look up — how's the sky right now?" Asked inside the app once each part
// of the day (morning, afternoon, evening, night) if you haven't told us
// yet, so people keep noticing the real sky. Pick a sky tile and it is
// painted into NewStep's arched window; one more tap puts it in School Sky
// (asking how you are first if you have no star today).

type Slot = 'morning' | 'afternoon' | 'evening' | 'night';
export type Choice = { label: string; emoji: string; text: string };

export function currentSlot(d = new Date()): Slot {
  const h = d.getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

function slotKey(userId: string, d = new Date()) {
  const day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  return `checkin:${userId}:${day}:${currentSlot(d)}`;
}

const DAY_SKIES: Choice[] = [
  { label: 'Clear blue', emoji: '☀️', text: 'clear blue sky with the sun' },
  { label: 'A few clouds', emoji: '⛅', text: 'blue sky with a few fluffy clouds' },
  { label: 'Cloudy', emoji: '☁️', text: 'grey overcast cloudy sky' },
  { label: 'Rainy', emoji: '🌧', text: 'rainy grey sky' },
  { label: 'Foggy', emoji: '🌫', text: 'foggy hazy sky' },
  { label: 'Rainbow', emoji: '🌈', text: 'rainbow after rain' },
];
const EVENING_SKIES: Choice[] = [
  { label: 'Sunset glow', emoji: '🌅', text: 'pink and orange sunset' },
  { label: 'Fiery', emoji: '🔥', text: 'red fiery sunset' },
  { label: 'Purple dusk', emoji: '💜', text: 'purple dusk sky' },
  { label: 'Cloudy', emoji: '☁️', text: 'grey overcast cloudy dusk' },
  { label: 'Rainy', emoji: '🌧', text: 'rainy grey evening' },
  { label: 'Moon is out', emoji: '🌙', text: 'moon in the evening sky' },
];
const NIGHT_SKIES: Choice[] = [
  { label: 'Starry', emoji: '✨', text: 'clear night full of stars' },
  { label: 'Moon', emoji: '🌙', text: 'moon in the night sky with stars' },
  { label: 'Cloudy', emoji: '☁️', text: 'cloudy night sky' },
  { label: 'Rainy', emoji: '🌧', text: 'rainy night' },
  { label: 'Foggy', emoji: '🌫', text: 'foggy night' },
  { label: 'Deep dark', emoji: '🌌', text: 'dark night sky' },
];

export function skiesFor(slot: Slot) {
  if (slot === 'evening') return EVENING_SKIES;
  if (slot === 'night') return NIGHT_SKIES;
  return DAY_SKIES;
}

export const FALLBACK_SCENE: SkyScene = { colors: ['#9FC9F0', '#C8E2F7', '#F3F0E6'], clouds: 'none', cloud_color: '#FFFFFF', things: [], title: '' };

// NewStep's arched window with a sky painted inside.
const ARCH = 'M10 84 V40 A40 40 0 0 1 90 40 V84 Z';
const STAR_DOTS = [[24, 28], [38, 18], [58, 24], [72, 40], [30, 52], [80, 22], [48, 44], [64, 60], [20, 70]];

export function SkyWindow({ scene, width }: { scene: SkyScene; width: number }) {
  const [c0, c1, c2] = scene.colors;
  const has = (t: string) => scene.things.includes(t as never);
  const clouds = { none: 0, few: 1, scattered: 2, overcast: 4 }[scene.clouds];
  const dark = has('stars') || has('moon') && !has('sun');
  return (
    <Svg width={width} height={width * 0.86} viewBox="0 0 100 86">
      <Defs>
        <LinearGradient id="skyCheckGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c0} />
          <Stop offset="0.6" stopColor={c1} />
          <Stop offset="1" stopColor={c2} />
        </LinearGradient>
        <ClipPath id="skyCheckArch">
          <Path d={ARCH} />
        </ClipPath>
      </Defs>
      <G clipPath="url(#skyCheckArch)">
        <Rect x="0" y="0" width="100" height="86" fill="url(#skyCheckGrad)" />
        {dark || has('stars')
          ? STAR_DOTS.map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.1 : 0.7} fill="#FFFFFF" opacity={0.85} />)
          : null}
        {has('sun') ? (
          <G>
            <Circle cx="68" cy="34" r="13" fill="#FFF3C4" opacity={0.35} />
            <Circle cx="68" cy="34" r="8" fill="#FFE08A" />
          </G>
        ) : null}
        {has('moon') ? <Path d="M70 22 A10 10 0 1 0 78 40 A8 8 0 1 1 70 22 Z" fill="#FFF4D2" /> : null}
        {has('rainbow')
          ? ['#FF8A80', '#FFC86B', '#FFF08A', '#9EE6A0', '#8CC8FF', '#B9A3FF'].map((c, i) => (
              <Path key={c} d={`M${16 + i * 3} 84 A${34 - i * 3} ${34 - i * 3} 0 0 1 ${84 - i * 3} 84`} stroke={c} strokeWidth={2.6} fill="none" opacity={0.85} />
            ))
          : null}
        {Array.from({ length: clouds }, (_, i) => {
          const x = [30, 62, 44, 76][i];
          const y = [40, 52, 26, 30][i];
          return (
            <G key={i} opacity={0.92}>
              <Ellipse cx={x} cy={y} rx={13} ry={5.5} fill={scene.cloud_color} />
              <Ellipse cx={x - 5} cy={y - 3.5} rx={6.5} ry={5.5} fill={scene.cloud_color} />
              <Ellipse cx={x + 4} cy={y - 4.5} rx={7.5} ry={6.5} fill={scene.cloud_color} />
            </G>
          );
        })}
        {has('rain')
          ? Array.from({ length: 14 }, (_, i) => (
              <Line key={i} x1={14 + i * 5.5} y1={46 + (i % 3) * 8} x2={11 + i * 5.5} y2={54 + (i % 3) * 8} stroke="#DDEBFF" strokeWidth={1} opacity={0.8} />
            ))
          : null}
        {has('fog') ? <Rect x="0" y="50" width="100" height="36" fill="#FFFFFF" opacity={0.35} /> : null}
      </G>
      <Path d={ARCH} fill="none" stroke="#E7D8C6" strokeWidth={3.2} strokeLinejoin="round" />
      <Path d="M50 1.5 V84 M10 58 H90" stroke="#E7D8C6" strokeWidth={1.8} />
      <Path d="M6 85 H94" stroke="#D9C6B0" strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

export function SkyTile({ choice, scene, selected, onPress }: { choice: Choice; scene: SkyScene; selected: boolean; onPress: () => void }) {
  const [c0, c1, c2] = scene.colors;
  const id = `tile${choice.label.replace(/\W/g, '')}`;
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ selected }}>
      <View style={[styles.swatch, selected && styles.swatchOn]}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c0} />
              <Stop offset="0.6" stopColor={c1} />
              <Stop offset="1" stopColor={c2} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
        <Text style={styles.swatchEmoji}>{choice.emoji}</Text>
      </View>
      <Text style={[styles.tileLabel, selected && styles.tileLabelOn]} numberOfLines={1}>
        {choice.label}
      </Text>
    </TouchableOpacity>
  );
}

// The check-in opens on the heart, not the weather: first "is anything on
// your mind?", with three soft ways forward — set a worry down as an
// anonymous lantern, ask classmates for a hand, or (if today is okay) light
// a star in the school sky, which is the sky picker below.
function heartTitle(slot: Slot) {
  if (slot === 'night') return 'Still up? Anything on your mind?';
  if (slot === 'evening') return 'How was today, really?';
  return 'Anything on your mind?';
}

type Props = {
  userId: string | undefined;
  // Only ask students who are in a school (School Sky is per school).
  enabled: boolean;
  onShared?: () => void;
  onOpenSky: () => void;
  // Opens the lantern composer (anonymous, with its own crisis support).
  onOpenLantern: () => void;
  // Opens a new "Need Help" post.
  onAskHelp: () => void;
};

export default function SkyCheckSheet({ userId, enabled, onShared, onOpenSky, onOpenLantern, onAskHelp }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [mood, setMood] = useState<SkyMood | null>(null);
  const [existing, setExisting] = useState<{ mood: SkyMood; note: string | null; photo: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  // 'heart' asks how they're really doing; 'sky' is the star/sky picker.
  const [step, setStep] = useState<'heart' | 'sky'>('heart');
  const slot = currentSlot();
  const phase = skyPhase();
  const choices = skiesFor(slot);
  const scenes = useMemo(() => {
    const out: Record<string, SkyScene> = {};
    for (const c of choices) out[c.label] = interpretSky(c.text, phase) ?? FALLBACK_SCENE;
    return out;
  }, [choices, phase]);
  const shown = choice ? scenes[choice.label] : scenes[choices[0].label];
  const paint = useRef(new Animated.Value(1)).current;

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
    setChoice(null);
    setMood(null);
    setStep('heart');
  };

  const goTo = (next: () => void) => {
    Haptics.selectionAsync();
    close();
    next();
  };

  const pick = (c: Choice) => {
    Haptics.selectionAsync();
    setChoice(c);
    paint.setValue(0.2);
    Animated.timing(paint, { toValue: 1, duration: 450, useNativeDriver: true }).start();
  };

  const save = async () => {
    const m = existing?.mood ?? mood;
    if (!choice || !m) return;
    setSaving(true);
    try {
      const scene = await describeSky(choice.text, phase);
      await setMyStar({
        mood: m,
        note: existing?.note ?? '',
        photoUrl: existing?.photo ?? null,
        skyColors: null,
        desc: scene ? choice.text : null,
        scene,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      remember();
      setOpen(false);
      setChoice(null);
      setMood(null);
      setStep('heart');
      onShared?.();
    } catch {
      // stay open so they can try again
    } finally {
      setSaving(false);
    }
  };

  if (!enabled) return null;
  const needsMood = !existing;
  const ready = !!choice && (!needsMood || !!mood);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} accessibilityLabel="Not now" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          {step === 'heart' ? (
            <>
              <View style={styles.heartGlow}>
                <LanternGlyph size={44} />
              </View>
              <Text style={styles.title}>{heartTitle(slot)}</Text>
              <Text style={styles.sub}>Big or small, it's okay to not be okay.</Text>

              <View style={styles.paths}>
                <TouchableOpacity style={[styles.path, styles.pathWarm]} onPress={() => goTo(onOpenLantern)} activeOpacity={0.85} accessibilityRole="button">
                  <View style={styles.pathIcon}>
                    <LanternGlyph size={22} />
                  </View>
                  <View style={styles.pathText}>
                    <Text style={styles.pathTitle}>Something's weighing on me</Text>
                    <Text style={styles.pathSub}>Set it down as a lantern. No name.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.path} onPress={() => goTo(onAskHelp)} activeOpacity={0.85} accessibilityRole="button">
                  <View style={styles.pathIcon}>
                    <NSIcon name="help" size={24} />
                  </View>
                  <View style={styles.pathText}>
                    <Text style={styles.pathTitle}>I could use a hand</Text>
                    <Text style={styles.pathSub}>Ask a classmate at your school.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.path}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setStep('sky');
                  }}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <View style={styles.pathIcon}>
                    <NSIcon name="star" size={24} />
                  </View>
                  <View style={styles.pathText}>
                    <Text style={styles.pathTitle}>I'm doing okay</Text>
                    <Text style={styles.pathSub}>Light your star in today's sky.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={close} style={styles.laterCenter} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.later}>Not now</Text>
              </TouchableOpacity>
            </>
          ) : (
          <>
          <Animated.View style={[styles.windowWrap, { opacity: paint }]}>
            <SkyWindow scene={shown} width={118} />
          </Animated.View>
          <Text style={styles.title}>{choice ? choice.label : 'Look up for a second'}</Text>
          <Text style={styles.sub}>{choice ? 'Is this your sky right now?' : "What's out your window right now?"}</Text>

          <View style={styles.tiles}>
            {choices.map((c) => (
              <SkyTile key={c.label} choice={c} scene={scenes[c.label]} selected={choice?.label === c.label} onPress={() => pick(c)} />
            ))}
          </View>

          {needsMood && choice ? (
            <View style={styles.moodBlock}>
              <Text style={styles.moodQ}>And how are you?</Text>
              <View style={styles.moods}>
                {SKY_MOODS.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.mood, mood === m.key && styles.moodOn]}
                    onPress={() => setMood(m.key)}
                    accessibilityRole="button"
                    accessibilityLabel={m.label}
                  >
                    <Text style={styles.moodEmoji}>{m.emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}

          {saving ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
          ) : choice ? (
            <PrimaryButton title="Put it in the sky" icon="sparkles" disabled={!ready} onPress={save} style={{ marginTop: spacing.lg }} />
          ) : null}

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
          </>
          )}
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
  windowWrap: {
    alignSelf: 'center',
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xl,
    color: colors.textDark,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  sub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textMid,
    textAlign: 'center',
    marginTop: 2,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
    marginTop: spacing.lg,
  },
  tile: {
    width: '31%',
    alignItems: 'center',
  },
  swatch: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchOn: {
    borderColor: colors.textDark,
  },
  swatchEmoji: {
    fontSize: 18,
  },
  tileLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textMid,
    marginTop: 5,
  },
  tileLabelOn: {
    fontFamily: fontFamily.bold,
    color: colors.textDark,
  },
  moodBlock: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  moodQ: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  moods: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  mood: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodOn: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primaryLight,
  },
  moodEmoji: {
    fontSize: 22,
  },
  heartGlow: {
    alignSelf: 'center',
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paths: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  path: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  // The first way forward is the one this check-in is really for.
  pathWarm: {
    backgroundColor: '#FFF6E6',
    borderColor: '#F6DFB4',
  },
  pathIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pathText: {
    flex: 1,
  },
  pathTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  pathSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: 1,
  },
  laterCenter: {
    alignSelf: 'center',
    marginTop: spacing.lg,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
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
