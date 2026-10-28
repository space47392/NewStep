import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Animated, Easing, Image, ScrollView, StyleSheet, useAnimatedValue } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { askPermission } from '../../components/askPermission';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Defs, RadialGradient, LinearGradient, Rect, Circle, Stop } from 'react-native-svg';
import SkyScene, { Horizon, skyPhase, phaseWords, DescribedSkyLook, landColors, PHASE_SKY } from '../../components/SkyScene';
import { extractSkyPalette, paintSky, SkyPalette } from '../../lib/skyColors';
import SkyWeather from '../../components/SkyWeather';
import { hasBlockedWords, KIND_WORDS_MESSAGE } from '../../lib/contentFilter';
import { fetchLanterns, Lantern } from '../../lib/lanterns';
import { soundsLikeCrisis } from '../../lib/crisis';
import { useWarmSheet } from '../../components/WarmSheet';
import { SkyTile, SkyWindow, skiesFor, currentSlot, FALLBACK_SCENE } from '../../components/SkyCheckSheet';
import { interpretSky } from '../../lib/skyInterpret';
import MoodFace from '../../components/MoodFace';
import SupportLines from '../../components/SupportLines';
import { warmAlert } from '../../components/WarmAlert';
import FadeInView from '../../components/FadeInView';
import { useTilt, tiltTransform, Tilt } from '../../lib/useTilt';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  fetchSchoolSky,
  setMyStar,
  removeMyStar,
  fetchSkyDiary,
  uploadSkyPhoto,
  removeSkyPhoto,
  describeSky,
  sharedSky,
  blendDescribedSky,
  THING_EMOJI,
  SkyScene as DescribedSky,
  fetchTodayTwinkles,
  sendTwinkle,
  fetchWishes,
  makeWish,
  cheerWish,
  deleteWish,
  reportWish,
  dominantMoods,
  moodWeather,
  weatherLine,
  constellationName,
  WISH_MAX,
  TwinkleSummary,
  SkyWish,
  starPosition,
  skyMood,
  SKY_MOODS,
  SKY_NOTE_MAX,
  SkyMood,
  SkyStar,
} from '../../lib/sky';
import { fetchBlockedUserIds } from '../../lib/blocks';
import { getOrCreateConversation, sendMessage } from '../../lib/chat';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BreatheSheet from '../../components/BreatheSheet';
import CareSheet, { Care, careFor } from '../../components/CareSheet';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import PrimaryButton from '../../components/PrimaryButton';
import ReportSheet from '../../components/ReportSheet';
import { colors, spacing, radius, fontSize, fontFamily, dark } from '../../constants/theme';
import { MainStackParamList, ReportTargetType } from '../../types';
import { errorMessage } from '../../lib/errors';


const SPARKLE = 'M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z';

// One classmate's star: a four-point sparkle in their mood colour with a
// soft halo, rising into place when the sky opens. The mood emoji only
// shows once the star is tapped.
function SkyStarButton({
  star,
  index,
  mine,
  selected,
  twinkles,
  burstKey,
  onPress,
  onLongPress,
  tilt,
  justPlaced = 0,
}: {
  tilt?: Tilt;
  // Changes when this star was just put up → it rises from the school.
  justPlaced?: number;
  star: SkyStar;
  index: number;
  mine: boolean;
  selected: boolean;
  twinkles: number;
  // Changes whenever this star just received a twinkle → plays a burst.
  burstKey: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const burst = useAnimatedValue(1);
  useEffect(() => {
    if (burstKey === 0) return;
    burst.setValue(0);
    Animated.timing(burst, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [burstKey, burst]);
  const mood = skyMood(star.mood);
  const pos = starPosition(star.user_id, index);
  const size = mine ? 38 : 32;
  const pulse = useAnimatedValue(0);
  const rise = useAnimatedValue(0);
  useEffect(() => {
    Animated.spring(rise, { toValue: 1, delay: 150 + index * 140, friction: 6, useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay((index * 370) % 1800),
        Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, rise, index]);

  const arrive = useAnimatedValue(1);
  useEffect(() => {
    if (!justPlaced) return;
    arrive.setValue(0);
    Animated.timing(arrive, { toValue: 1, duration: 1700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      burst.setValue(0);
      Animated.timing(burst, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    });
  }, [justPlaced, arrive, burst]);

  // The first few words of their note, shown in the thought bubble.
  const snippet = star.note?.trim() ? (star.note.trim().length > 22 ? star.note.trim().slice(0, 21).trimEnd() + '…' : star.note.trim()) : '';
  const first = star.profile?.full_name?.trim().split(/\s+/)[0] ?? 'Student';
  return (
    <Animated.View
      style={[
        styles.starWrap,
        { left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, marginTop: -size / 2 },
        {
          opacity: rise,
          transform: [
            // Classmates' stars sit at a middle depth when the phone tilts.
            ...tiltTransform(tilt, 9),
            { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
            { translateY: arrive.interpolate({ inputRange: [0, 1], outputRange: [340, 0] }) },
            { scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
            { scale: arrive.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.45, 0.9, 1] }) },
          ],
        },
      ]}
    >
      {/* While rising: a soft streak of its own light trailing below. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.trail, { top: size / 2, opacity: arrive.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 0.9, 0.35, 0] }) }]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 10 100" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={`trail-${star.user_id}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={mood.color} stopOpacity={0.9} />
              <Stop offset="1" stopColor={mood.color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="3.5" y="0" width="3" height="100" rx="1.5" fill={`url(#trail-${star.user_id})`} />
        </Svg>
      </Animated.View>

      {/* Tapped: a little thought floating over the star — the feeling,
          and the first words of what they wrote. */}
      {selected ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thought,
            {
              opacity: arrive.interpolate({ inputRange: [0, 0.85, 1], outputRange: [0, 0, 1] }),
              transform: [{ translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
            },
          ]}
        >
          <View style={[styles.thoughtBubble, { borderColor: mood.color }]}>
            <MoodFace mood={mood.key} size={20} />
            {snippet ? (
              <Text style={styles.thoughtText} numberOfLines={1}>
                {snippet}
              </Text>
            ) : null}
          </View>
          <View style={[styles.thoughtDot, { borderColor: mood.color }]} />
          <View style={[styles.thoughtDotSmall, { borderColor: mood.color }]} />
        </Animated.View>
      ) : null}
      {/* Twinkle burst: a ring of light that expands and fades. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.burst,
          {
            borderColor: mood.color,
            opacity: burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
            transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.6] }) }],
          },
        ]}
      />
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        activeOpacity={0.8}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={`${mine ? 'Your star' : first}: feeling ${mood.label}${star.note ? `, ${star.note}` : ''}`}
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      >
        <Animated.View
          style={[
            styles.halo,
            {
              width: size * 2.6,
              height: size * 2.6,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: selected ? [0.8, 1] : [0.45, 0.85] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.12] }) }],
            },
          ]}
        >
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Defs>
              <RadialGradient id={`halo-${star.user_id}`} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={mood.color} stopOpacity={0.55} />
                <Stop offset="0.45" stopColor={mood.color} stopOpacity={0.18} />
                <Stop offset="1" stopColor={mood.color} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx="50" cy="50" r="50" fill={`url(#halo-${star.user_id})`} />
          </Svg>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.rays,
            {
              width: size * 2.2,
              height: size * 2.2,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }),
              transform: [{ rotate: '8deg' }, { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.1] }) }],
            },
          ]}
        >
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Defs>
              <LinearGradient id={`rayH-${star.user_id}`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#fff" stopOpacity={0} />
                <Stop offset="0.5" stopColor="#fff" stopOpacity={0.9} />
                <Stop offset="1" stopColor="#fff" stopOpacity={0} />
              </LinearGradient>
              <LinearGradient id={`rayV-${star.user_id}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#fff" stopOpacity={0} />
                <Stop offset="0.5" stopColor="#fff" stopOpacity={0.9} />
                <Stop offset="1" stopColor="#fff" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="49.3" width="100" height="1.4" fill={`url(#rayH-${star.user_id})`} />
            <Rect x="49.3" y="0" width="1.4" height="100" fill={`url(#rayV-${star.user_id})`} />
          </Svg>
        </Animated.View>
        <Animated.View style={{ transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.06] }) }] }}>
          <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d={SPARKLE} fill={mood.color} />
            <Path d={SPARKLE} fill="#fff" opacity={0.45} transform="translate(6 6) scale(0.5)" />
          </Svg>
        </Animated.View>
        {star.photo_url ? (
          <View style={styles.starPhotoBadge}>
            <Ionicons name="camera" size={9} color={colors.ink} />
          </View>
        ) : null}
      </TouchableOpacity>
      <Text style={[styles.starName, mine && styles.starNameMine, selected && styles.starNameSelected]} numberOfLines={1}>
        {mine ? 'You' : first}
        {twinkles > 0 ? <Text style={styles.twinkleCount}>{`  ✨${twinkles}`}</Text> : null}
      </Text>
    </Animated.View>
  );
}

// A slower shooting star you can catch (tap) to make a wish. Crosses the
// sky every so often; more often when the school is excited.
function CatchableStar({ width, height, frequent, onCatch }: { width: number; height: number; frequent: boolean; onCatch: () => void }) {
  const t = useAnimatedValue(0);
  const [flying, setFlying] = useState(false);
  const [lane] = useState(() => Math.random());
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const fly = () => {
      if (cancelled) return;
      t.setValue(0);
      setFlying(true);
      Animated.timing(t, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start(() => {
        if (cancelled) return;
        setFlying(false);
        timer = setTimeout(fly, (frequent ? 5000 : 11000) + Math.random() * 5000);
      });
    };
    timer = setTimeout(fly, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      t.stopAnimation();
    };
  }, [t, frequent]);
  if (!flying || width === 0) return null;
  const startY = height * (0.08 + lane * 0.25);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: width * 0.9,
        top: startY,
        opacity: t.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, -width * 0.75] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.22] }) },
        ],
      }}
    >
      <TouchableOpacity
        onPress={() => {
          t.stopAnimation();
          setFlying(false);
          onCatch();
        }}
        hitSlop={{ top: 30, bottom: 30, left: 30, right: 30 }}
        accessibilityRole="button"
        accessibilityLabel="Catch the shooting star to make a wish"
        style={styles.catchStar}
      >
        <View style={styles.catchHead} />
        <View style={styles.catchTail} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// A classmate's lantern, drifting up slowly with a warm glow.
function FloatingLantern({ lantern, index, width, height, onPress }: { lantern: Lantern; index: number; width: number; height: number; onPress: () => void }) {
  const drift = useAnimatedValue(0);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 5200 + (index % 3) * 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 5200 + (index % 3) * 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [drift, index]);
  let h = 7;
  for (let i = 0; i < lantern.id.length; i++) h = (h * 33 + lantern.id.charCodeAt(i)) >>> 0;
  const x = 0.08 + ((h % 1000) / 1000) * 0.84;
  // Below the empty-sky message, above the wish lights on the horizon.
  const y = Math.min(0.5 + (((h >> 10) % 1000) / 1000) * 0.14, (height - 240) / height);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x * width - 14,
        top: y * height,
        transform: [
          { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) },
          { rotate: drift.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '4deg'] }) },
        ],
      }}
    >
      <TouchableOpacity
        onPress={onPress}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={`A lantern: ${lantern.text}`}
        style={styles.lanternWrap}
      >
        <View style={styles.lanternGlow} />
        <View style={styles.lanternTop} />
        <View style={[styles.lanternBody, lantern.mine && styles.lanternBodyMine]} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// Today's wishes, as small warm lights floating just above the horizon.
function WishLight({ wish, index, width, height, selected, onPress }: { wish: SkyWish; index: number; width: number; height: number; selected: boolean; onPress: () => void }) {
  const bob = useAnimatedValue(0);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 2200 + (index % 4) * 400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 2200 + (index % 4) * 400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bob, index]);
  let h = 0;
  for (let i = 0; i < wish.id.length; i++) h = (h * 31 + wish.id.charCodeAt(i)) >>> 0;
  const x = 0.06 + ((h % 1000) / 1000) * 0.88;
  const y = height - 150 - ((h >> 10) % 70);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x * width - 14,
        top: y,
        transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
      }}
    >
      <TouchableOpacity
        onPress={onPress}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={`A wish: ${wish.text}`}
        style={styles.wishWrap}
      >
        <View style={[styles.wishGlow, selected && styles.wishGlowSelected]} />
        <View style={[styles.wishCore, wish.mine && styles.wishCoreMine]} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// Faint dotted lines joining today's stars, left to right: the school's
// constellation for the day.
function Constellation({ stars, width, height }: { stars: SkyStar[]; width: number; height: number }) {
  if (stars.length < 2 || width === 0) return null;
  const pts = stars
    .map((st, i) => starPosition(st.user_id, i))
    .map((p) => ({ x: p.x * width, y: p.y * height }))
    .sort((a, b) => a.x - b.x);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path d={d} stroke="#fff" strokeOpacity={0.22} strokeWidth={1} strokeDasharray="2 5" fill="none" />
    </Svg>
  );
}

// One-tap warm words for a classmate's star, fitting how they feel.
const WARM_WORDS: Record<SkyMood, string[]> = {
  happy: ['Love this ✨', 'So happy for you!'],
  excited: ['Yay! 🎉', 'Tell me everything!'],
  chill: ['Love that calm 🌿', 'Enjoy it!'],
  nervous: ["You've got this 💪", 'Rooting for you'],
  tired: ['Rest well 🌙', 'Proud of you today'],
  down: ['Here for you 💛', 'Sending a hug 🫂'],
};

// After a face is picked, the composer asks a question that fits it.
// Answering is always optional — a star can go up without words.
const FOLLOW_UPS: Record<SkyMood, { q: string; placeholder: string }> = {
  happy: { q: 'Nice! What made today good?', placeholder: 'Even something small counts…' },
  excited: { q: "Ooh, what's got you excited?", placeholder: 'Tell your school about it…' },
  chill: { q: "Love that. What's keeping it calm?", placeholder: 'A quiet moment, a good song…' },
  nervous: { q: "What's making you nervous?", placeholder: 'A test, a new class, meeting people…' },
  tired: { q: 'Long day? What wore you out?', placeholder: "It's okay to just rest…" },
  down: { q: "I'm sorry it's heavy. Want to say what happened?", placeholder: 'Only if you want to…' },
};

// Each composer step slides in from its side, so moving between them feels
// like turning to the next page.
function SlideIn({ from, children }: { from: number; children: ReactNode }) {
  const t = useAnimatedValue(0);
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [t]);
  return (
    <Animated.View style={{ opacity: t, transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

// A soft four-point star that breathes in the window of the star composer.
function MoodStar({ color }: { color: string }) {
  const pulse = useAnimatedValue(0);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.cMoodStar,
        { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.12] }) }], opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
      ]}
    >
      <Svg width={34} height={34} viewBox="0 0 24 24">
        <Circle cx="12" cy="12" r="10" fill={color} opacity={0.35} />
        <Path d="M12 2.5 C12.8 8.6 15.4 11.2 21.5 12 C15.4 12.8 12.8 15.4 12 21.5 C11.2 15.4 8.6 12.8 2.5 12 C8.6 11.2 11.2 8.6 12 2.5 Z" fill="#FFFDF5" stroke={color} strokeWidth={1.2} />
      </Svg>
    </Animated.View>
  );
}

export default function SchoolSkyScreen() {
  const { ask, sheet } = useWarmSheet();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'SchoolSky'>>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();

  const [stars, setStars] = useState<SkyStar[]>([]);
  // The sky follows the real time of day (set once per visit).
  const [phase] = useState(() => skyPhase());
  // Tilting the phone shifts the sky's layers for depth.
  const tilt = useTilt();
  const [skySize, setSkySize] = useState({ width: 0, height: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The composer stays simple; the sky bits open only if you want them.
  const [showSkyExtras, setShowSkyExtras] = useState(false);
  // Quick sky tiles in the composer, the same as the sky check on Home.
  const composerSkies = skiesFor(currentSlot());
  const composerScenes = useMemo(() => {
    const out: Record<string, NonNullable<ReturnType<typeof interpretSky>>> = {};
    for (const c of composerSkies) out[c.label] = interpretSky(c.text, phase) ?? FALLBACK_SCENE;
    return out;
  }, [composerSkies, phase]);

  // Opened with "add my star": the composer rises once the sky has.
  const [composerOpen, setComposerOpen] = useState(false);
  useEffect(() => {
    if (!route.params?.openComposer) return;
    const t = setTimeout(() => setComposerOpen(true), 420);
    return () => clearTimeout(t);
  }, [route.params?.openComposer]);

  // Entering: the screen is dark for a breath, then the sky lifts into view —
  // like looking up.
  const lookUp = useAnimatedValue(0);
  useEffect(() => {
    Animated.timing(lookUp, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [lookUp]);
  const [mood, setMood] = useState<SkyMood>('happy');
  // False until a face is tapped on a new star: the follow-up waits for it.
  const [moodPicked, setMoodPicked] = useState(false);
  // Bumped after saving, so my star rises into the sky.
  const [placedKey, setPlacedKey] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  // A gentle moment after a heavy star (see CareSheet), and the breathing minute.
  const [care, setCare] = useState<Care | null>(null);
  const [breatheOpen, setBreatheOpen] = useState(false);
  // Warm words already sent to a star today (this visit), by user id.
  const [warmthSent, setWarmthSent] = useState<Record<string, string>>({});
  // The composer's sky photo: the current one (a URL), a fresh camera shot
  // (a local file, uploaded on save), or none.
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoIsNew, setPhotoIsNew] = useState(false);
  // "Look up": the student's own words about the sky, and how the AI read them.
  const [skyText, setSkyText] = useState('');
  const [skyScene, setSkyScene] = useState<DescribedSky | null>(null);
  const [painting, setPainting] = useState(false);
  const [paintError, setPaintError] = useState<string | null>(null);
  // After "Paint my sky" the sheet steps aside and the whole screen shows
  // the described sky before it's saved.
  const [previewing, setPreviewing] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: ReportTargetType; id: string } | null>(null);
  const [twinkles, setTwinkles] = useState<TwinkleSummary>({ counts: {}, sentTo: new Set() });
  const [bursts, setBursts] = useState<Record<string, number>>({});
  const [wishes, setWishes] = useState<SkyWish[]>([]);
  const [lanterns, setLanterns] = useState<Lantern[]>([]);
  const [selectedWishId, setSelectedWishId] = useState<string | null>(null);
  const [wishOpen, setWishOpen] = useState(false);
  // "Today's real sky": the photos the sky was painted from, opened from
  // the painted tag rather than hung in the sky itself.
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [wishText, setWishText] = useState('');
  const [wishSaving, setWishSaving] = useState(false);
  // A little light that flies from the bottom of the sky to a star when you
  // send it a twinkle.
  const fly = useAnimatedValue(0);
  const [flyTo, setFlyTo] = useState<{ x: number; y: number; color: string } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [sky, blocked, tw, ws] = await Promise.all([
        fetchSchoolSky(),
        fetchBlockedUserIds(user.id).catch(() => new Set<string>()),
        fetchTodayTwinkles(user.id).catch(() => ({ counts: {}, sentTo: new Set<string>() })),
        fetchWishes().catch(() => [] as SkyWish[]),
      ]);
      fetchLanterns()
        .then(setLanterns)
        .catch(() => setLanterns([]));
      setStars(sky.filter((s) => !blocked.has(s.user_id)));
      setTwinkles(tw);
      setWishes(ws);
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
  const selectedWish = wishes.find((w) => w.id === selectedWishId) ?? null;

  const handleTwinkle = async (star: SkyStar) => {
    if (!user || star.user_id === user.id) return;
    if (twinkles.sentTo.has(star.user_id)) {
      showToast('You already sent them a twinkle today ✨');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const index = stars.findIndex((s) => s.user_id === star.user_id);
    const pos = starPosition(star.user_id, index);
    setFlyTo({ x: pos.x * skySize.width, y: pos.y * skySize.height, color: skyMood(star.mood).color });
    fly.setValue(0);
    Animated.timing(fly, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start(() => {
      setFlyTo(null);
      setBursts((b) => ({ ...b, [star.user_id]: (b[star.user_id] ?? 0) + 1 }));
    });
    try {
      await sendTwinkle(star.user_id);
      setTwinkles((t) => ({
        counts: { ...t.counts, [star.user_id]: (t.counts[star.user_id] ?? 0) + 1 },
        sentTo: new Set(t.sentTo).add(star.user_id),
      }));
      const first = star.profile?.full_name?.trim().split(/\s+/)[0] ?? 'them';
      showToast(`Twinkle sent to ${first} ✨`);
    } catch (err) {
      showToast(errorMessage(err, "Couldn't send the twinkle"));
    }
  };

  const handleCatch = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelectedId(null);
    setSelectedWishId(null);
    setWishText('');
    setWishOpen(true);
  };

  const handleMakeWish = async () => {
    if (wishSaving || !wishText.trim()) return;
    if (hasBlockedWords(wishText)) {
      showToast(KIND_WORDS_MESSAGE);
      return;
    }
    setWishSaving(true);
    try {
      await makeWish(wishText);
      setWishOpen(false);
      showToast('Your wish is floating in the sky 🌠');
      setWishes(await fetchWishes().catch(() => wishes));
    } catch (err) {
      showToast(errorMessage(err, "Couldn't make the wish"));
    } finally {
      setWishSaving(false);
    }
  };

  const handleCheer = async (wish: SkyWish) => {
    if (wish.cheered || wish.mine) return;
    Haptics.selectionAsync();
    setWishes((ws) => ws.map((w) => (w.id === wish.id ? { ...w, cheered: true, cheers: w.cheers + 1 } : w)));
    try {
      await cheerWish(wish.id);
    } catch (err) {
      setWishes((ws) => ws.map((w) => (w.id === wish.id ? { ...w, cheered: false, cheers: w.cheers - 1 } : w)));
      showToast(errorMessage(err, "Couldn't cheer that wish"));
    }
  };

  const handleReportWish = (wish: SkyWish) => {
    ask({
      title: 'Report this wish?',
      message: "It'll be hidden for you and sent for review. Thanks for keeping the sky kind.",
      actions: [
        {
          label: 'Report',
          danger: true,
          onPress: async () => {
            try {
              await reportWish(wish.id);
              setSelectedWishId(null);
              setWishes((ws) => ws.filter((w) => w.id !== wish.id));
              showToast('Reported — thank you 💛');
            } catch (err) {
              showToast(errorMessage(err, "Couldn't report the wish"));
            }
          },
        },
      ],
    });
  };

  const handleDeleteWish = async (wish: SkyWish) => {
    try {
      await deleteWish(wish.id);
      setSelectedWishId(null);
      setWishes((ws) => ws.filter((w) => w.id !== wish.id));
    } catch {
      showToast("Couldn't remove the wish");
    }
  };

  const openComposer = () => {
    setShowSkyExtras(false);
    setMood((myStar?.mood as SkyMood) ?? 'happy');
    setMoodPicked(!!myStar);
    setNote(myStar?.note ?? '');
    setPhotoUri(myStar?.photo_url ?? null);
    setPhotoIsNew(false);
    setSkyText(myStar?.sky_desc ?? '');
    setSkyScene(myStar?.sky_desc && myStar.sky_colors && myStar.sky_title
      ? { colors: myStar.sky_colors, clouds: myStar.sky_clouds ?? 'few', cloud_color: '#ffffff', things: myStar.sky_things ?? [], title: myStar.sky_title }
      : null);
    setPaintError(null);
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
      setMoodPicked(true);
      setNote(myStar.note ?? '');
      setPhotoUri(myStar.photo_url ?? null);
      setPhotoIsNew(false);
      setSkyText(myStar.sky_desc ?? '');
      setSkyScene(myStar?.sky_desc && myStar.sky_colors && myStar.sky_title
      ? { colors: myStar.sky_colors, clouds: myStar.sky_clouds ?? 'few', cloud_color: '#ffffff', things: myStar.sky_things ?? [], title: myStar.sky_title }
      : null);
    }
  }, [composerOpen, loading, myStar]);

  // Camera only, on purpose: the point is to look up at the real sky right
  // now, not to pick an old photo.
  const handleSnapSky = async () => {
    if (!(await askPermission(ImagePicker.requestCameraPermissionsAsync, 'camera', 'to snap the sky'))) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.6,
    });
    if (result.canceled || !result.assets?.length) return;
    setPhotoUri(result.assets[0].uri);
    setPhotoIsNew(true);
  };

  // Sends the description to the AI painter (describe-sky Edge Function).
  const handlePaint = async () => {
    const text = skyText.trim();
    if (painting || text.length < 2) return;
    if (hasBlockedWords(text)) {
      setPaintError(KIND_WORDS_MESSAGE);
      return;
    }
    setPainting(true);
    setPaintError(null);
    try {
      const scene = await describeSky(text, phase);
      if (!scene) {
        setSkyScene(null);
        setPaintError("Let's keep it about the sky ☁️ Try describing what you see.");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSkyScene(scene);
      setPreviewing(true);
    } catch (err) {
      setPaintError(errorMessage(err, "Couldn't paint the sky right now."));
    } finally {
      setPainting(false);
    }
  };

  // Typed words (not a tile) are what the paint button paints.
  const ownWords = skyText.trim().length >= 2 && !composerSkies.some((c) => c.text === skyText);

  const handleSave = async (confirmedCrisis = false) => {
    if (saving || !user) return;
    if (hasBlockedWords(note) || hasBlockedWords(skyText)) {
      showToast(KIND_WORDS_MESSAGE);
      return;
    }
    // Words that sound like they may be in danger would go up with their
    // name on them. Pause once and offer the nameless lantern first.
    if (!confirmedCrisis && soundsLikeCrisis(note)) {
      warmAlert(
        'Want to say this with no name?',
        'Your star shows your name to classmates. A lantern carries the same words with no name, and the support lines are right there with it.',
        [
          {
            text: 'Send it as a lantern',
            onPress: () => {
              const words = note.trim();
              setComposerOpen(false);
              navigation.navigate('Lanterns', { compose: true, prefill: words });
            },
          },
          { text: 'Put up my star anyway', onPress: () => handleSave(true) },
          { text: 'Keep writing', style: 'cancel' },
        ]
      );
      return;
    }
    setSaving(true);
    try {
      // A fresh photo also gets its colours read for the painted sky; a kept
      // photo keeps the colours it already had.
      let skyColors: SkyPalette | null = null;
      if (photoUri && photoIsNew) {
        skyColors = await extractSkyPalette(photoUri).catch(() => null);
      } else if (photoUri) {
        skyColors = myStar?.sky_colors ?? null;
      }
      const photoUrl = photoUri && photoIsNew ? await uploadSkyPhoto(user.id, photoUri) : photoUri;
      // A painted description only counts if it still matches the text.
      const scene = skyScene && skyText.trim() ? skyScene : null;
      await setMyStar({ mood, note, photoUrl, skyColors, desc: scene ? skyText : null, scene });
      if (!photoUrl && myStar?.photo_url) removeSkyPhoto(user.id).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setComposerOpen(false);
      setPreviewing(false);
      showToast(myStar ? 'Your star is updated ✨' : 'Your star is in the sky ✨');
      await load();
      if (user) setSelectedId(user.id);
      setPlacedKey((k) => k + 1);
      if (user && (mood === 'down' || mood === 'nervous')) {
        const savedMood = mood;
        const uid = user.id;
        setTimeout(async () => {
          try {
            const key = `care:${uid}:${new Date().toDateString()}`;
            if (await AsyncStorage.getItem(key)) return;
            const next = careFor(await fetchSkyDiary(uid, 30), savedMood);
            if (!next) return;
            await AsyncStorage.setItem(key, '1');
            setCare(next);
          } catch {
            // no care moment this time
          }
        }, 2600);
      }
    } catch (err) {
      showToast(errorMessage(err, "Couldn't save your star"));
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

  const sendWarmth = async (star: SkyStar, words: string) => {
    if (!user || !star.profile || warmthSent[star.user_id]) return;
    Haptics.selectionAsync();
    setWarmthSent((w) => ({ ...w, [star.user_id]: words }));
    try {
      const conversationId = await getOrCreateConversation(star.user_id);
      await sendMessage({ conversationId, senderId: user.id, content: `${words} (saw your star in School Sky)` });
      showToast(`Sent to ${star.profile.full_name?.split(' ')[0] ?? 'them'} 💛`);
    } catch {
      setWarmthSent((w) => {
        const n = { ...w };
        delete n[star.user_id];
        return n;
      });
      showToast("Couldn't send that — try again");
    }
  };

  const others = stars.filter((s) => s.user_id !== user?.id).length;
  // Today's sky, repainted from the colours in classmates' sky photos.
  const palettes = stars.map((s) => s.sky_colors).filter((p): p is SkyPalette => !!p && p.length === 3);
  const painted = paintSky(palettes);
  // Mood weather and today's constellation, from the moods in the sky.
  const moods = dominantMoods(stars);
  // What classmates described seeing today (rainbow, birds, rain…).
  const shared = sharedSky(stars);
  // The sky as classmates described it today: their colours averaged band
  // by band, the most common cloudiness, clouds tinted from the horizon.
  const todaysLook: DescribedSkyLook | null = blendDescribedSky(stars);
  const previewLook: DescribedSkyLook | null =
    previewing && skyScene ? { colors: skyScene.colors, clouds: skyScene.clouds, cloudColor: skyScene.cloud_color } : null;
  const shownThings = previewing && skyScene ? skyScene.things : shared.things;
  // The ground below takes its colours from whatever sky is showing.
  const land = landColors((previewLook ?? todaysLook)?.colors ?? PHASE_SKY[phase]);
  const moodW = moods[0] ? moodWeather(moods[0]) : null;
  // Described weather wins over mood weather — it's what people actually saw.
  const weather = shared.things.includes('rain')
    ? 'rain'
    : shared.clouds === 'overcast'
      ? 'clouds'
      : shared.things.includes('shooting_star')
        ? 'meteors'
        : moodW;
  const constellation = stars.length >= 3 ? constellationName(moods) : null;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateY: lookUp.interpolate({ inputRange: [0, 1], outputRange: [90, 0] }) }, { scale: lookUp.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1] }) }] },
        ]}
      >
        <SkyScene
          phase={phase}
          painted={previewLook || todaysLook ? null : painted}
          tilt={tilt}
          things={shownThings}
          described={previewLook ?? todaysLook}
        />
      </Animated.View>
      <SkyWeather kind={weather} />

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
                ? `${phaseWords(phase)}, the sky is quiet`
                : `${phaseWords(phase)} · ${stars.length} ${stars.length === 1 ? 'star' : 'stars'} shining`}
          </Text>
          {moods[0] && !loading ? (
            <Text style={styles.weatherLine} numberOfLines={1}>
              {weatherLine(moods[0], route.params?.schoolName, phaseWords(phase).toLowerCase())}
            </Text>
          ) : null}
          {palettes.length > 0 ? (
            <TouchableOpacity
              style={styles.paintedTag}
              activeOpacity={0.8}
              onPress={() => setGalleryOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="See today's real sky photos"
            >
              <Text style={styles.paintedText}>
                🎨 Sky painted from {palettes.length} {palettes.length === 1 ? 'photo' : 'photos'}
              </Text>
              <View style={styles.swatches}>
                {palettes.slice(0, 4).map((p, i) => (
                  <View key={i} style={[styles.swatch, { marginLeft: i === 0 ? 0 : -4 }]}>
                    {p.map((c, j) => (
                      <View key={j} style={{ flex: 1, backgroundColor: c }} />
                    ))}
                  </View>
                ))}
              </View>
              <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('SkyDiary')}
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Open your Sky Diary"
        >
          <Ionicons name="book-outline" size={18} color="#fff" />
        </TouchableOpacity>
      </View>


      <TouchableOpacity
        style={styles.sky}
        activeOpacity={1}
        onPress={() => setSelectedId(null)}
        onLayout={(e) => setSkySize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        <Horizon tilt={tilt} land={land} />
        {!loading ? <Constellation stars={stars} width={skySize.width} height={skySize.height} /> : null}
        {constellation ? (
          <View style={styles.constellationTag} pointerEvents="none">
            <Text style={styles.constellationText}>✦ Today's constellation · {constellation}</Text>
          </View>
        ) : null}
        {!loading
          ? lanterns.slice(0, 8).map((l, i) => (
              <FloatingLantern
                key={l.id}
                lantern={l}
                index={i}
                width={skySize.width}
                height={skySize.height}
                onPress={() =>
                  navigation.navigate('LanternDetail', { lanternId: l.id, text: l.text, mine: l.mine, crisis: l.crisis, createdAt: l.created_at, hugCount: l.hug_count, huggedByMe: l.hugged_by_me })
                }
              />
            ))
          : null}
        {!loading
          ? wishes.map((w, i) => (
              <WishLight
                key={w.id}
                wish={w}
                index={i}
                width={skySize.width}
                height={skySize.height}
                selected={w.id === selectedWishId}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedId(null);
                  setSelectedWishId(w.id === selectedWishId ? null : w.id);
                }}
              />
            ))
          : null}
        {!loading ? (
          <CatchableStar width={skySize.width} height={skySize.height} frequent={weather === 'meteors'} onCatch={handleCatch} />
        ) : null}
        {flyTo ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.flyLight,
              { backgroundColor: flyTo.color, shadowColor: flyTo.color },
              {
                transform: [
                  { translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [skySize.width / 2, flyTo.x] }) },
                  { translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [skySize.height - 40, flyTo.y] }) },
                  { scale: fly.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0.6, 1.2, 0.4] }) },
                ],
              },
            ]}
          />
        ) : null}
        {loading ? (
          <ActivityIndicator color={colors.warm.honey} style={styles.loading} />
        ) : stars.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No stars yet</Text>
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
              twinkles={twinkles.counts[s.user_id] ?? 0}
              burstKey={bursts[s.user_id] ?? 0}
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedWishId(null);
                setSelectedId(s.user_id === selectedId ? null : s.user_id);
              }}
              onLongPress={() => handleTwinkle(s)}
              tilt={tilt}
              justPlaced={s.user_id === user?.id ? placedKey : 0}
            />
          ))
        )}
      </TouchableOpacity>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.md, backgroundColor: land.ground }, previewing && styles.hidden]}>
        {selectedWish ? (
          <View style={styles.card}>
            <Text style={styles.wishLabel}>🌠 {selectedWish.mine ? 'Your wish' : 'A wish from someone at your school'}</Text>
            <Text style={styles.cardNote}>“{selectedWish.text}”</Text>
            <Text style={styles.cardMeta}>
              💛 {selectedWish.cheers} {selectedWish.cheers === 1 ? 'cheer' : 'cheers'} · {formatRelativeTime(selectedWish.created_at)}
            </Text>
            <View style={styles.cardActions}>
              {selectedWish.mine ? (
                <PrimaryButton title="Let it go" size="sm" variant="warmGhost" onPress={() => handleDeleteWish(selectedWish)} style={styles.cardButton} />
              ) : (
                <PrimaryButton
              variant="warm"
                  title={selectedWish.cheered ? 'Cheered 💛' : 'Cheer this wish 💛'}
                  size="sm"
                  disabled={selectedWish.cheered}
                  onPress={() => handleCheer(selectedWish)}
                  style={styles.cardButton}
                />
              )}
              {!selectedWish.mine ? (
                <TouchableOpacity
                  onPress={() => handleReportWish(selectedWish)}
                  style={styles.reportButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Report this wish"
                >
                  <Ionicons name="flag-outline" size={18} color={colors.warm.creamFaint} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : selected ? (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Avatar uri={selected.profile?.avatar_url ?? null} size={44} />
              <View style={styles.cardText}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {selected.user_id === user?.id ? 'Your star' : selected.profile?.full_name ?? 'Student'}
                </Text>
                <View style={styles.moodLine}>
                  <MoodFace mood={selected.mood} size={18} />
                  <Text style={styles.cardMeta}>
                    Feeling {skyMood(selected.mood).label.toLowerCase()} · {formatRelativeTime(selected.updated_at)}
                  </Text>
                </View>
              </View>
            </View>
            {selected.note ? <Text style={styles.cardNote}>“{selected.note}”</Text> : null}
            {selected.sky_desc ? (
              <View style={styles.cardSky}>
                {selected.sky_colors ? (
                  <View style={styles.cardSkySwatch}>
                    {selected.sky_colors.map((c, i) => (
                      <View key={i} style={{ flex: 1, backgroundColor: c }} />
                    ))}
                  </View>
                ) : null}
                <View style={styles.sceneText}>
                  <Text style={styles.cardSkyTitle}>
                    {selected.sky_title ?? 'Their sky'} {(selected.sky_things ?? []).map((t) => THING_EMOJI[t]).join('')}
                  </Text>
                  <Text style={styles.cardSkyDesc} numberOfLines={3}>
                    “{selected.sky_desc}”
                  </Text>
                </View>
              </View>
            ) : null}
            {selected.user_id === user?.id && (twinkles.counts[selected.user_id] ?? 0) > 0 ? (
              <Text style={styles.twinkleReceived}>
                ✨ {twinkles.counts[selected.user_id]} {twinkles.counts[selected.user_id] === 1 ? 'classmate' : 'classmates'} sent you a twinkle today
              </Text>
            ) : null}
            {selected.photo_url ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => navigation.navigate('PhotoViewer', { photoUrls: [selected.photo_url!], initialIndex: 0 })}
                accessibilityRole="imagebutton"
                accessibilityLabel="Open sky photo"
              >
                <Image source={{ uri: selected.photo_url }} style={styles.cardPhoto} />
              </TouchableOpacity>
            ) : null}
            {selected.user_id !== user?.id && selected.profile ? (
              <View style={styles.warmthRow}>
                {warmthSent[selected.user_id] ? (
                  <Text style={styles.warmthSent}>You sent “{warmthSent[selected.user_id]}”</Text>
                ) : (
                  (WARM_WORDS[selected.mood as SkyMood] ?? WARM_WORDS.happy).map((w) => (
                    <TouchableOpacity key={w} style={styles.warmthChip} onPress={() => sendWarmth(selected, w)} activeOpacity={0.8} accessibilityRole="button">
                      <Text style={styles.warmthChipText}>{w}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ) : null}
            <View style={styles.cardActions}>
              {selected.user_id === user?.id ? (
                <>
                  <PrimaryButton
              variant="warm" title="Change" size="sm" icon="create-outline" onPress={openComposer} style={styles.cardButton} />
                  <PrimaryButton title="Remove" size="sm" variant="warmGhost" onPress={handleRemove} style={styles.cardButton} />
                </>
              ) : (
                <>
                  <PrimaryButton
              variant="warm"
                    title={twinkles.sentTo.has(selected.user_id) ? 'Twinkled ✨' : 'Twinkle ✨'}
                    size="sm"
                    disabled={twinkles.sentTo.has(selected.user_id)}
                    onPress={() => handleTwinkle(selected)}
                    style={styles.cardButton}
                  />
                  <PrimaryButton
                    title="Say hi"
                    size="sm"
                    variant="warmGhost"
                    icon="chatbubble-ellipses-outline"
                    loading={openingChat}
                    onPress={() => handleSayHi(selected)}
                    style={styles.cardButton}
                  />
                  <TouchableOpacity
                    onPress={() => navigation.navigate('UserProfile', { userId: selected.user_id })}
                    style={styles.reportButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Open profile"
                  >
                    <Ionicons name="person-circle-outline" size={22} color={dark.textMid} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setReportTarget({ type: 'profile', id: selected.user_id })}
                    style={styles.reportButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Report this star"
                  >
                    <Ionicons name="flag-outline" size={18} color={dark.textLight} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        ) : (
          <>
            {!loading && stars.length > 0 ? (
              <Text style={styles.hint}>
                {others > 0
                  ? 'Tap a star to see how they are · hold to send a twinkle ✨'
                  : 'Catch a shooting star to make a wish 🌠'}
              </Text>
            ) : null}
            <TouchableOpacity
              style={styles.lanternLink}
              onPress={() => navigation.navigate('Lanterns')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Open Lanterns"
            >
              <Text style={styles.lanternLinkEmoji}>🏮</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.lanternLinkTitle}>Lanterns</Text>
                <Text style={styles.lanternLinkSub} numberOfLines={1}>
                  {lanterns.length
                    ? `${lanterns.length} ${lanterns.length === 1 ? 'worry is' : 'worries are'} floating — send some warmth`
                    : 'Something on your mind? Send it up, no name'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.warm.creamFaint} />
            </TouchableOpacity>
            <PrimaryButton
              variant="warm"
              title={myStar ? 'Change your star' : 'Add your star'}
              icon="sparkles-outline"
              onPress={openComposer}
            />
          </>
        )}
      </View>

      {previewing && skyScene ? (
        <View style={[styles.previewBar, { paddingBottom: insets.bottom + spacing.md, backgroundColor: land.ground }]}>
          <Text style={styles.previewEyebrow}>✨ This is the sky you described</Text>
          <Text style={styles.previewTitle}>
            {skyScene.title} {skyScene.things.map((t) => THING_EMOJI[t]).join('')}
          </Text>
          <Text style={styles.previewDesc} numberOfLines={2}>
            “{skyText.trim()}”
          </Text>
          <View style={styles.cardActions}>
            <PrimaryButton title="Edit" size="sm" variant="warmGhost" onPress={() => setPreviewing(false)} style={styles.cardButton} />
            <PrimaryButton
              variant="warm"
              title={myStar ? 'Update my star' : 'Put it in the sky'}
              size="sm"
              icon="sparkles"
              loading={saving}
              onPress={() => handleSave()}
              style={styles.cardButton}
            />
          </View>
        </View>
      ) : null}

      <Modal
        visible={composerOpen && !previewing}
        transparent
        animationType="slide"
        onRequestClose={() => setComposerOpen(false)}
      >
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setComposerOpen(false)} />
          <View style={[styles.cSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            {/* Today's sky through NewStep's window — your star waits in it,
                glowing in your mood's colour. */}
            <View style={styles.cHero}>
              <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
                <Defs>
                  <LinearGradient id="composerHero" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={(composerScenes[composerSkies[0].label] ?? FALLBACK_SCENE).colors[0]} stopOpacity={0.55} />
                    <Stop offset="0.55" stopColor={(composerScenes[composerSkies[0].label] ?? FALLBACK_SCENE).colors[2]} stopOpacity={0.35} />
                    <Stop offset="1" stopColor={colors.background} stopOpacity={1} />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#composerHero)" />
              </Svg>
              <View style={[styles.cHandle, styles.cHandleOnSky]} />
              <View>
                <SkyWindow scene={skyScene ?? composerScenes[composerSkies[0].label] ?? FALLBACK_SCENE} width={112} />
                <MoodStar color={moodPicked ? SKY_MOODS.find((m) => m.key === mood)?.color ?? colors.primary : colors.primary} />
              </View>
            </View>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.cContent} keyboardShouldPersistTaps="handled">
            {!moodPicked ? (
              // Step 1: just the feeling.
              <SlideIn key="mood" from={-36}>
                <Text style={styles.cTitle}>How are you, really?</Text>
                <Text style={styles.cSub}>Tap the one that feels closest.</Text>
                <View style={styles.cMoodGrid}>
                  {SKY_MOODS.map((m) => (
                    <TouchableOpacity
                      key={m.key}
                      style={styles.cMoodTile}
                      activeOpacity={0.8}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setMood(m.key);
                        setMoodPicked(true);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={m.label}
                    >
                      <View style={[styles.cMoodTileFace, { backgroundColor: m.color + '33' }]}>
                        <MoodFace mood={m.key} size={46} />
                      </View>
                      <Text style={styles.cMoodTileLabel}>{m.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </SlideIn>
            ) : (
              // Step 2: a question made for that feeling. Answering is up to them.
              <SlideIn key="share" from={36}>
                <View style={styles.cStepBar}>
                  <TouchableOpacity
                    style={styles.cBack}
                    onPress={() => setMoodPicked(false)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Pick a different feeling"
                  >
                    <Ionicons name="chevron-back" size={18} color={colors.textMid} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.cMoodChip, { backgroundColor: skyMood(mood).color + '40' }]} onPress={() => setMoodPicked(false)} activeOpacity={0.8}>
                    <MoodFace mood={mood} size={22} />
                    <Text style={styles.cMoodChipText}>Feeling {skyMood(mood).label.toLowerCase()}</Text>
                  </TouchableOpacity>
                  <View style={styles.cBack} />
                </View>

                <Text style={[styles.cTitle, styles.cQuestion]}>{FOLLOW_UPS[mood].q}</Text>
                <TextInput
                  style={[styles.cInput, styles.cHeart]}
                  placeholder={FOLLOW_UPS[mood].placeholder}
                  placeholderTextColor={colors.textLight}
                  value={note}
                  onChangeText={setNote}
                  maxLength={SKY_NOTE_MAX}
                  multiline
                />
                <Text style={styles.cOptional}>Only if you want to · classmates see it with your star</Text>
                {soundsLikeCrisis(note) ? (
                  <FadeInView style={styles.cSupport}>
                    <SupportLines tone="light" />
                  </FadeInView>
                ) : null}

                {/* A heavier day gets a gentle way to say it with no name. */}
                {mood === 'down' || mood === 'nervous' || mood === 'tired' ? (
                  <TouchableOpacity
                    style={styles.cHeavy}
                    activeOpacity={0.85}
                    onPress={() => {
                      setComposerOpen(false);
                      navigation.navigate('Lanterns', { compose: true });
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.cHeavyText}>
                      Rather say it with no name? <Text style={styles.cHeavyLink}>Send a lantern ›</Text>
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {mood === 'down' || mood === 'nervous' || mood === 'tired' ? (
                  <TouchableOpacity style={styles.cBreathe} onPress={() => setBreatheOpen(true)} accessibilityRole="button">
                    <Ionicons name="leaf-outline" size={14} color={colors.primaryDark} />
                    <Text style={styles.cHeavyLink}>Take a 1-minute breath first</Text>
                  </TouchableOpacity>
                ) : null}
              </SlideIn>
            )}
            {moodPicked ? (
            <>

            {/* Everything else is optional and tucked away. */}
            {showSkyExtras ? (
              <View style={styles.cExtras}>
                <Text style={styles.cSection}>👀 What's the sky like?</Text>
              <View style={styles.cTiles}>
                {composerSkies.map((c) => (
                  <SkyTile
                    key={c.label}
                    choice={c}
                    scene={composerScenes[c.label]}
                    selected={skyText === c.text}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSkyText(c.text);
                      setPaintError(null);
                      setSkyScene(composerScenes[c.label]);
                    }}
                  />
                ))}
              </View>
              <View style={styles.cFieldRow}>
                <TextInput
                  style={[styles.cInput, { flex: 1 }]}
                  placeholder="Or in your own words…"
                  placeholderTextColor={colors.textLight}
                  value={composerSkies.some((c) => c.text === skyText) ? '' : skyText}
                  onChangeText={(t) => {
                    setSkyText(t);
                    setPaintError(null);
                  }}
                  maxLength={200}
                />
                <TouchableOpacity
                  style={[styles.cIconButton, styles.cIconButtonFilled, !ownWords && { opacity: 0.4 }]}
                  onPress={handlePaint}
                  disabled={painting || !ownWords}
                  accessibilityRole="button"
                  accessibilityLabel={skyScene ? 'Paint it again' : 'Paint my sky'}
                >
                  {painting ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <Ionicons name="color-palette" size={18} color={colors.onPrimary} />
                  )}
                </TouchableOpacity>
              </View>
              {paintError ? <Text style={styles.paintError}>{paintError}</Text> : null}
                  <View style={[styles.cFieldRow, { justifyContent: 'flex-end' }]}>
                  <Text style={styles.cPhotoLabel}>Add a photo of the sky</Text>
                {photoUri ? (
                  <TouchableOpacity onPress={handleSnapSky} onLongPress={() => setPhotoUri(null)} accessibilityLabel="Retake the sky photo. Hold to remove.">
                    <Image source={{ uri: photoUri }} style={styles.notePhoto} />
                    <TouchableOpacity style={styles.photoRemove} onPress={() => setPhotoUri(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Remove photo">
                      <Ionicons name="close" size={11} color={colors.warm.honeyInk} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.cIconButton} onPress={handleSnapSky} accessibilityLabel="Add a photo of the sky">
                    <Ionicons name="camera-outline" size={18} color={colors.textMid} />
                  </TouchableOpacity>
                )}
                  </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.cMore} onPress={() => setShowSkyExtras(true)} accessibilityRole="button">
                <Ionicons name="add" size={16} color={colors.textMid} />
                <Text style={styles.cMoreText}>Add today's sky</Text>
              </TouchableOpacity>
            )}
            {note.length > SKY_NOTE_MAX - 20 ? (
              <Text style={styles.cCount}>
                {note.length}/{SKY_NOTE_MAX}
              </Text>
            ) : null}

            <PrimaryButton
              title={myStar ? 'Update my star' : 'Put it in the sky'}
              icon="sparkles"
              loading={saving}
              onPress={() => handleSave()}
              style={styles.sheetSave}
            />
            </>
            ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={wishOpen} transparent animationType="fade" onRequestClose={() => setWishOpen(false)}>
        <KeyboardAvoidingView style={styles.wishBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setWishOpen(false)} />
          <View style={styles.wishSheet}>
            <Text style={styles.wishEmoji}>🌠</Text>
            <Text style={styles.sheetTitle}>You caught a shooting star!</Text>
            <Text style={styles.wishSub}>Make a wish. It floats in your school's sky for a day — nobody sees who made it.</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="I wish…"
              placeholderTextColor={colors.warm.creamFaint}
              value={wishText}
              onChangeText={setWishText}
              maxLength={WISH_MAX}
              autoFocus
            />
            <Text style={styles.noteCount}>
              {wishText.length}/{WISH_MAX}
            </Text>
            <PrimaryButton
              variant="warm" title="Send it to the sky" icon="sparkles" loading={wishSaving} disabled={!wishText.trim()} onPress={handleMakeWish} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={galleryOpen} transparent animationType="fade" onRequestClose={() => setGalleryOpen(false)}>
        <View style={styles.galleryBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setGalleryOpen(false)} />
          <Text style={styles.galleryTitle}>Today's real sky</Text>
          <Text style={styles.gallerySub}>The photos tonight's sky was painted from</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.galleryRail}
            style={styles.galleryScroll}
          >
            {stars
              .filter((st) => st.photo_url)
              .map((st, i) => (
                <TouchableOpacity
                  key={st.user_id}
                  activeOpacity={0.9}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setGalleryOpen(false);
                    setSelectedWishId(null);
                    setSelectedId(st.user_id);
                  }}
                  style={[styles.galleryCard, { transform: [{ rotate: i % 2 === 0 ? '-3deg' : '2.5deg' }] }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Sky photo from ${st.user_id === user?.id ? 'you' : st.profile?.full_name ?? 'a classmate'}`}
                >
                  <Image source={{ uri: st.photo_url! }} style={styles.galleryPhoto} />
                  <View style={[styles.moodLine, styles.moodLineCenter]}>
                    <MoodFace mood={st.mood} size={20} />
                    <Text style={[styles.galleryCaption, styles.galleryCaptionInline]} numberOfLines={1}>
                      {st.user_id === user?.id ? 'You' : st.profile?.full_name?.trim().split(/\s+/)[0] ?? ''}
                    </Text>
                  </View>
                  {st.sky_colors ? (
                    <View style={styles.galleryPalette}>
                      {st.sky_colors.map((c, j) => (
                        <View key={j} style={{ flex: 1, backgroundColor: c }} />
                      ))}
                    </View>
                  ) : null}
                </TouchableOpacity>
              ))}
          </ScrollView>
          <Text style={styles.galleryHint}>Tap a photo to find their star</Text>
        </View>
      </Modal>
      <ReportSheet target={reportTarget} reporterId={user?.id} onClose={() => setReportTarget(null)} />
      <CareSheet
        care={care}
        onClose={() => setCare(null)}
        onBreathe={() => {
          setCare(null);
          setBreatheOpen(true);
        }}
        onLantern={() => {
          setCare(null);
          navigation.navigate('Lanterns', { compose: true });
        }}
      />
      <BreatheSheet visible={breatheOpen} onClose={() => setBreatheOpen(false)} />
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#07060C', opacity: lookUp.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 0.25, 0] }) }]}
      />
      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  // The star composer: a bright sheet like the rest of the app.
  cSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '92%',
  },
  cHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  cContent: {
    paddingBottom: spacing.sm,
  },
  cWindow: {
    alignSelf: 'center',
    marginTop: spacing.xs,
  },
  cHero: {
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.sm,
    height: 136,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  cHandleOnSky: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    marginBottom: spacing.sm,
  },
  cMoodStar: {
    position: 'absolute',
    top: 34,
    alignSelf: 'center',
  },
  cTitle: {
    fontFamily: fontFamily.brand,
    fontSize: 26,
    color: colors.textDark,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  cSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    textAlign: 'center',
    marginTop: 2,
  },
  cMoodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingHorizontal: 3,
    paddingVertical: 3,
  },
  cMood: {
    width: 50,
    height: 50,
    borderRadius: 24,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cMoodOn: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    transform: [{ scale: 1.08 }],
  },
  cMoodEmoji: {
    fontSize: 24,
  },
  cQuestion: {
    fontSize: 22,
    lineHeight: 28,
    marginTop: spacing.md,
  },
  cMoodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  cMoodTile: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  cMoodTileFace: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cMoodTileLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
    marginTop: 6,
  },
  cStepBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  cBack: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cMoodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  cMoodChipText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
  cFollowQ: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  cBreathe: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: 4,
  },
  cSupport: {
    marginTop: spacing.md,
  },
  cOptional: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: 6,
  },
  cHeart: {
    marginTop: spacing.sm,
    minHeight: 92,
    textAlignVertical: 'top',
  },
  cExtras: {
    marginTop: spacing.sm,
  },
  cMore: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 4,
    marginTop: spacing.md,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: colors.hairline,
  },
  cMoreText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  cPhotoLabel: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  cMoodLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primaryDark,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  cHeavy: {
    alignSelf: 'center',
    backgroundColor: '#FFF6E6',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  cHeavyText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    textAlign: 'center',
  },
  cHeavyLink: {
    fontFamily: fontFamily.semibold,
    color: colors.primaryDark,
  },
  cSection: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  cTiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.sm,
  },
  cFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cInput: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  cIconButton: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cIconButtonFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  cCount: {
    alignSelf: 'flex-end',
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: 4,
  },
  screen: {
    flex: 1,
    backgroundColor: dark.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.warm.glassSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.xl,
    color: colors.warm.cream,
  },
  subtitle: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.warm.creamMuted,
  },
  sky: {
    flex: 1,
    marginHorizontal: 0,
  },
  loading: {
    marginTop: spacing.xxl,
  },
  starWrap: {
    position: 'absolute',
    width: 84,
    marginLeft: -42,
    alignItems: 'center',
  },
  halo: {
    position: 'absolute',
  },
  burst: {
    position: 'absolute',
    top: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
  },
  twinkleCount: {
    color: colors.sticker.yellow,
    fontFamily: fontFamily.semibold,
  },
  twinkleReceived: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.sticker.yellow,
  },
  weatherLine: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.warm.creamFaint,
    marginTop: 2,
  },
  constellationTag: {
    position: 'absolute',
    bottom: 118,
    alignSelf: 'center',
    backgroundColor: 'rgba(10,9,26,0.45)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  constellationText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.85)',
  },
  catchStar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  catchHead: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#FFF7D6',
    shadowColor: '#FFF7D6',
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  catchTail: {
    width: 70,
    height: 2,
    marginLeft: -2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,247,214,0.55)',
    // Trails up and to the right, behind a star falling down-left.
    transform: [{ rotate: '-16deg' }, { translateY: -9 }],
  },
  wishWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wishGlow: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,196,120,0.22)',
  },
  wishGlowSelected: {
    backgroundColor: 'rgba(255,196,120,0.5)',
  },
  wishCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFC478',
  },
  wishCoreMine: {
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  flyLight: {
    position: 'absolute',
    left: -6,
    top: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  wishLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: '#FFC478',
  },
  wishBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(10,9,26,0.7)',
  },
  wishSheet: {
    backgroundColor: '#1E1928',
    borderRadius: 26,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,196,120,0.3)',
  },
  wishEmoji: {
    fontSize: 40,
    textAlign: 'center',
  },
  wishSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: dark.textMid,
  },
  trail: {
    position: 'absolute',
    width: 10,
    height: 150,
  },
  rays: {
    position: 'absolute',
  },
  thought: {
    position: 'absolute',
    bottom: '100%',
    left: -60,
    right: -60,
    alignItems: 'center',
    marginBottom: 2,
  },
  thoughtBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 190,
    backgroundColor: '#FFFDF7',
    borderRadius: 16,
    borderWidth: 1.5,
    paddingLeft: 5,
    paddingRight: 10,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  thoughtText: {
    flexShrink: 1,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: '#3B3557',
  },
  thoughtDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.2,
    backgroundColor: '#FFFDF7',
    marginTop: 3,
    marginLeft: -10,
  },
  thoughtDotSmall: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    borderWidth: 1,
    backgroundColor: '#FFFDF7',
    marginTop: 2,
    marginLeft: -2,
  },
  moodBubble: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 4,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    backgroundColor: 'rgba(22,21,43,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moodBubbleEmoji: {
    fontSize: 18,
  },
  starName: {
    marginTop: 6,
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.warm.creamMuted,
    maxWidth: 84,
  },
  starNameMine: {
    color: colors.sticker.yellow,
  },
  starNameSelected: {
    color: '#fff',
    fontFamily: fontFamily.semibold,
  },
  starPhotoBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.sticker.yellow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoStrip: {
    marginTop: -spacing.xs,
  },
  photoStripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing.lg,
    gap: spacing.sm,
  },
  paintedTag: {
    alignSelf: 'flex-start',
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.warm.glassSoft,
    borderRadius: radius.full,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 3,
    flexShrink: 1,
  },
  hidden: {
    opacity: 0,
  },
  previewBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
    backgroundColor: dark.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  previewEyebrow: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.warm.honey,
  },
  previewTitle: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.xl,
    color: colors.warm.cream,
  },
  previewDesc: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.warm.creamMuted,
  },
  lanternWrap: {
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lanternGlow: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,170,90,0.2)',
  },
  lanternTop: {
    width: 10,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#8A4B2A',
    marginBottom: 1,
  },
  lanternBody: {
    width: 18,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#FFB46E',
    borderWidth: 1.5,
    borderColor: '#FFD9A8',
  },
  lanternBodyMine: {
    borderColor: '#fff',
  },
  lanternLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warm.glass,
    borderWidth: 1,
    borderColor: colors.warm.line,
    borderRadius: 18,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  lanternLinkEmoji: {
    fontSize: 22,
  },
  lanternLinkTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.warm.cream,
  },
  lanternLinkSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.warm.creamFaint,
  },
  sheetStar: {
    alignSelf: 'center',
    marginTop: -spacing.xs,
  },
  moodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginTop: spacing.sm,
  },
  moodPick: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.warm.glassSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  moodPickOn: {
    borderColor: colors.warm.honey,
    backgroundColor: 'rgba(245,194,122,0.16)',
    transform: [{ scale: 1.12 }],
  },
  moodEmojiOn: {
    fontSize: 26,
  },
  moodPicked: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.warm.honey,
    textAlign: 'center',
  },
  sheetDivider: {
    height: 1,
    backgroundColor: colors.warm.line,
    marginVertical: spacing.sm,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // A round button that sits inside or beside a field.
  fieldButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.warm.honey,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 6,
    bottom: 6,
  },
  fieldButtonOff: {
    opacity: 0.4,
  },
  fieldButtonGhost: {
    position: 'relative',
    right: 0,
    bottom: 0,
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.warm.glassSoft,
  },
  noteField: {
    flex: 1,
  },
  notePhoto: {
    width: 48,
    height: 48,
    borderRadius: 14,
  },
  photoRemove: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.warm.honey,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postcard: {
    height: 74,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  postcardTitle: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.lg,
    color: '#fff',
  },
  postcardThings: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.88)',
  },
  sheetSave: {
    marginTop: spacing.sm,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetContent: {
    gap: spacing.sm,
  },
  lookUp: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 20,
    backgroundColor: 'rgba(245,194,122,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,194,122,0.18)',
  },
  lookUpTitle: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.md,
    color: colors.warm.cream,
  },
  lookUpSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.warm.creamFaint,
    marginTop: -6,
  },
  lookUpRow: {
    flexDirection: 'row',
  },
  lookUpInput: {
    flex: 1,
    minHeight: 52,
    textAlignVertical: 'top',
    paddingRight: 56,
  },
  paintError: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.secondaryDark,
  },
  scenePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.warm.glassSoft,
    borderRadius: 16,
    padding: spacing.sm,
  },
  sceneSwatch: {
    width: 44,
    height: 56,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  sceneText: {
    flex: 1,
    gap: 2,
  },
  sceneTitle: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.md,
    color: colors.warm.cream,
  },
  sceneThings: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.warm.creamMuted,
  },
  photoLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  cardSky: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  cardSkySwatch: {
    width: 34,
    height: 46,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  cardSkyTitle: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.md,
    color: dark.textDark,
  },
  cardSkyDesc: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: dark.textMid,
  },
  galleryBackdrop: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(10,9,26,0.88)',
    paddingVertical: spacing.xl,
  },
  galleryTitle: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.xl,
    color: '#fff',
    textAlign: 'center',
  },
  gallerySub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.sticker.lilac,
    textAlign: 'center',
    marginTop: 2,
  },
  galleryScroll: {
    flexGrow: 0,
    marginVertical: spacing.lg,
  },
  galleryRail: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.lg,
  },
  galleryCard: {
    width: 210,
    backgroundColor: '#FBF8F1',
    borderRadius: 4,
    padding: 10,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  galleryPhoto: {
    width: '100%',
    height: 250,
    borderRadius: 2,
    backgroundColor: '#ddd',
  },
  galleryCaption: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.md,
    color: '#3B3557',
    textAlign: 'center',
    marginTop: 8,
  },
  // The three colours read from this photo, as a little paint strip.
  galleryPalette: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 6,
  },
  galleryHint: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: dark.textLight,
    textAlign: 'center',
  },
  paintedText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.warm.creamMuted,
    flexShrink: 1,
  },
  swatches: {
    flexDirection: 'row',
  },
  // A tiny three-band chip per photo: its top, middle and lower sky.
  swatch: {
    width: 14,
    height: 18,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  photoStripLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.sticker.lilac,
  },
  photoRail: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  photoThumb: {
    width: 78,
    height: 104,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  photoThumbSelected: {
    borderColor: colors.sticker.yellow,
  },
  photoThumbImage: {
    width: '100%',
    height: '100%',
  },
  photoThumbTag: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 4,
    backgroundColor: 'rgba(22,21,43,0.75)',
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  photoThumbTagText: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    color: '#fff',
  },
  cardPhoto: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
  },
  reportButton: {
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  snapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: dark.primaryLight,
  },
  snapEmoji: {
    fontSize: 26,
  },
  snapText: {
    flex: 1,
  },
  snapTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: dark.textDark,
  },
  snapSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: dark.textMid,
  },
  composerPhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  composerPhoto: {
    width: 72,
    height: 96,
    borderRadius: radius.md,
  },
  composerPhotoActions: {
    flex: 1,
    gap: 6,
  },
  composerPhotoTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: dark.textDark,
  },
  composerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  composerLinkText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.warm.honey,
  },
  empty: {
    alignItems: 'center',
    marginTop: spacing.xxl * 2,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.lg,
    color: '#fff',
  },
  emptySub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: dark.textMid,
    textAlign: 'center',
  },
  bottom: {
    backgroundColor: dark.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.warm.creamFaint,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.warm.glass,
    borderRadius: 22,
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
  cardText: {
    flex: 1,
  },
  cardName: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.warm.cream,
  },
  moodLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moodLineCenter: {
    justifyContent: 'center',
    marginTop: 8,
  },
  galleryCaptionInline: {
    marginTop: 0,
    flexShrink: 1,
  },
  cardMeta: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.warm.creamFaint,
  },
  cardNote: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.warm.cream,
    lineHeight: 22,
  },
  warmthRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  warmthChip: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,240,220,0.25)',
    backgroundColor: 'rgba(255,240,220,0.08)',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  warmthChipText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.warm.cream,
  },
  warmthSent: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.warm.creamMuted,
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
    backgroundColor: 'rgba(12,9,20,0.45)',
  },
  sheet: {
    backgroundColor: '#1E1928',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: colors.warm.line,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  sheetHandle: {
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
    color: colors.warm.creamFaint,
    textAlign: 'center',
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
    paddingVertical: spacing.sm + 2,
    borderRadius: 16,
    backgroundColor: colors.warm.glassSoft,
    borderWidth: 1.5,
    borderColor: 'transparent',
    gap: 2,
  },
  moodEmoji: {
    fontSize: 24,
  },
  moodLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.warm.creamMuted,
  },
  noteInput: {
    backgroundColor: colors.warm.glassSoft,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.warm.cream,
  },
  noteCount: {
    alignSelf: 'flex-end',
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.warm.creamFaint,
    marginTop: -spacing.xs,
  },
});
