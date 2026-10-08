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
  Image,
  FlatList,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Defs, RadialGradient, Circle, Stop } from 'react-native-svg';
import SkyScene, { Horizon, skyPhase, phaseWords } from '../../components/SkyScene';
import { extractSkyPalette, paintSky, SkyPalette } from '../../lib/skyColors';
import SkyWeather from '../../components/SkyWeather';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  fetchSchoolSky,
  setMyStar,
  removeMyStar,
  uploadSkyPhoto,
  removeSkyPhoto,
  fetchTodayTwinkles,
  sendTwinkle,
  fetchWishes,
  makeWish,
  cheerWish,
  deleteWish,
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
import { getOrCreateConversation } from '../../lib/chat';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import PrimaryButton from '../../components/PrimaryButton';
import ReportSheet from '../../components/ReportSheet';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';
import { MainStackParamList, ReportTargetType } from '../../types';


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
}: {
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
  const burst = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (burstKey === 0) return;
    burst.setValue(0);
    Animated.timing(burst, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [burstKey, burst]);
  const mood = skyMood(star.mood);
  const pos = starPosition(star.user_id, index);
  const size = mine ? 38 : 32;
  const pulse = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
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

  const first = star.profile?.full_name?.trim().split(/\s+/)[0] ?? 'Student';
  return (
    <Animated.View
      style={[
        styles.starWrap,
        { left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, marginTop: -size / 2 },
        {
          opacity: rise,
          transform: [
            { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
            { scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
          ],
        },
      ]}
    >
      {selected ? (
        <View style={[styles.moodBubble, { borderColor: mood.color }]}>
          <Text style={styles.moodBubbleEmoji}>{mood.emoji}</Text>
        </View>
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
  const t = useRef(new Animated.Value(0)).current;
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

// Today's wishes, as small warm lights floating just above the horizon.
function WishLight({ wish, index, width, height, selected, onPress }: { wish: SkyWish; index: number; width: number; height: number; selected: boolean; onPress: () => void }) {
  const bob = useRef(new Animated.Value(0)).current;
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

export default function SchoolSkyScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'SchoolSky'>>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();

  const [stars, setStars] = useState<SkyStar[]>([]);
  // The sky follows the real time of day (set once per visit).
  const [phase] = useState(() => skyPhase());
  const [skySize, setSkySize] = useState({ width: 0, height: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(!!route.params?.openComposer);
  const [mood, setMood] = useState<SkyMood>('happy');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  // The composer's sky photo: the current one (a URL), a fresh camera shot
  // (a local file, uploaded on save), or none.
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoIsNew, setPhotoIsNew] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: ReportTargetType; id: string } | null>(null);
  const [twinkles, setTwinkles] = useState<TwinkleSummary>({ counts: {}, sentTo: new Set() });
  const [bursts, setBursts] = useState<Record<string, number>>({});
  const [wishes, setWishes] = useState<SkyWish[]>([]);
  const [selectedWishId, setSelectedWishId] = useState<string | null>(null);
  const [wishOpen, setWishOpen] = useState(false);
  const [wishText, setWishText] = useState('');
  const [wishSaving, setWishSaving] = useState(false);
  // A little light that flies from the bottom of the sky to a star when you
  // send it a twinkle.
  const fly = useRef(new Animated.Value(0)).current;
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
      showToast(err instanceof Error ? err.message : "Couldn't send the twinkle");
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
    setWishSaving(true);
    try {
      await makeWish(wishText);
      setWishOpen(false);
      showToast('Your wish is floating in the sky 🌠');
      setWishes(await fetchWishes().catch(() => wishes));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't make the wish");
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
      showToast(err instanceof Error ? err.message : "Couldn't cheer that wish");
    }
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
    setMood((myStar?.mood as SkyMood) ?? 'happy');
    setNote(myStar?.note ?? '');
    setPhotoUri(myStar?.photo_url ?? null);
    setPhotoIsNew(false);
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
      setPhotoUri(myStar.photo_url ?? null);
      setPhotoIsNew(false);
    }
  }, [composerOpen, loading, myStar]);

  // Camera only, on purpose: the point is to look up at the real sky right
  // now, not to pick an old photo.
  const handleSnapSky = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showToast('Allow camera access to snap the sky');
      return;
    }
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

  const handleSave = async () => {
    if (saving || !user) return;
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
      await setMyStar(mood, note, photoUrl, skyColors);
      if (!photoUrl && myStar?.photo_url) removeSkyPhoto(user.id).catch(() => {});
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
  // Today's sky, repainted from the colours in classmates' sky photos.
  const palettes = stars.map((s) => s.sky_colors).filter((p): p is SkyPalette => !!p && p.length === 3);
  const painted = paintSky(palettes);
  // Mood weather and today's constellation, from the moods in the sky.
  const moods = dominantMoods(stars);
  const weather = moods[0] ? moodWeather(moods[0]) : null;
  const constellation = stars.length >= 3 ? constellationName(moods) : null;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SkyScene phase={phase} painted={painted} />
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
                : `${phaseWords(phase)}, ${stars.length} ${stars.length === 1 ? 'star is' : 'stars are'} shining${route.params?.schoolName ? ` over ${route.params.schoolName}` : ''}`}
          </Text>
          {moods[0] && !loading ? (
            <Text style={styles.weatherLine} numberOfLines={2}>
              {weatherLine(moods[0], route.params?.schoolName, phaseWords(phase).toLowerCase())}
            </Text>
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

      {stars.some((s) => s.photo_url) ? (
        <View style={styles.photoStrip}>
          <View style={styles.photoStripHeader}>
            <Text style={styles.photoStripLabel}>📷 Today's real sky</Text>
            {palettes.length > 0 ? (
              <View style={styles.paintedTag}>
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
              </View>
            ) : null}
          </View>
          <FlatList
            horizontal
            data={stars.filter((s) => s.photo_url)}
            keyExtractor={(s) => s.user_id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoRail}
            renderItem={({ item: s }) => (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSelectedId(s.user_id)}
                style={[styles.photoThumb, s.user_id === selectedId && styles.photoThumbSelected]}
                accessibilityRole="button"
                accessibilityLabel={`Sky photo from ${s.user_id === user?.id ? 'you' : s.profile?.full_name ?? 'a classmate'}`}
              >
                <Image source={{ uri: s.photo_url! }} style={styles.photoThumbImage} />
                <View style={styles.photoThumbTag}>
                  <Text style={styles.photoThumbTagText} numberOfLines={1}>
                    {skyMood(s.mood).emoji} {s.user_id === user?.id ? 'You' : s.profile?.full_name?.trim().split(/\s+/)[0] ?? ''}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.sky}
        activeOpacity={1}
        onPress={() => setSelectedId(null)}
        onLayout={(e) => setSkySize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        <Horizon />
        {!loading ? <Constellation stars={stars} width={skySize.width} height={skySize.height} /> : null}
        {constellation ? (
          <View style={styles.constellationTag} pointerEvents="none">
            <Text style={styles.constellationText}>✦ Today's constellation · {constellation}</Text>
          </View>
        ) : null}
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
          <ActivityIndicator color={colors.sticker.lilac} style={styles.loading} />
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
            />
          ))
        )}
      </TouchableOpacity>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.md }]}>
        {selectedWish ? (
          <View style={styles.card}>
            <Text style={styles.wishLabel}>🌠 {selectedWish.mine ? 'Your wish' : 'A wish from someone at your school'}</Text>
            <Text style={styles.cardNote}>“{selectedWish.text}”</Text>
            <Text style={styles.cardMeta}>
              💛 {selectedWish.cheers} {selectedWish.cheers === 1 ? 'cheer' : 'cheers'} · {formatRelativeTime(selectedWish.created_at)}
            </Text>
            <View style={styles.cardActions}>
              {selectedWish.mine ? (
                <PrimaryButton title="Let it go" size="sm" variant="outline" onPress={() => handleDeleteWish(selectedWish)} style={styles.cardButton} />
              ) : (
                <PrimaryButton
                  title={selectedWish.cheered ? 'Cheered 💛' : 'Cheer this wish 💛'}
                  size="sm"
                  disabled={selectedWish.cheered}
                  onPress={() => handleCheer(selectedWish)}
                  style={styles.cardButton}
                />
              )}
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
                <Text style={styles.cardMeta}>
                  {skyMood(selected.mood).emoji} Feeling {skyMood(selected.mood).label.toLowerCase()} ·{' '}
                  {formatRelativeTime(selected.updated_at)}
                </Text>
              </View>
            </View>
            {selected.note ? <Text style={styles.cardNote}>“{selected.note}”</Text> : null}
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
            <View style={styles.cardActions}>
              {selected.user_id === user?.id ? (
                <>
                  <PrimaryButton title="Change" size="sm" icon="create-outline" onPress={openComposer} style={styles.cardButton} />
                  <PrimaryButton title="Remove" size="sm" variant="outline" onPress={handleRemove} style={styles.cardButton} />
                </>
              ) : (
                <>
                  <PrimaryButton
                    title={twinkles.sentTo.has(selected.user_id) ? 'Twinkled ✨' : 'Twinkle ✨'}
                    size="sm"
                    disabled={twinkles.sentTo.has(selected.user_id)}
                    onPress={() => handleTwinkle(selected)}
                    style={styles.cardButton}
                  />
                  <PrimaryButton
                    title="Say hi"
                    size="sm"
                    variant="outline"
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
                    <Ionicons name="person-circle-outline" size={22} color={colors.textMid} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setReportTarget({ type: 'profile', id: selected.user_id })}
                    style={styles.reportButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Report this star"
                  >
                    <Ionicons name="flag-outline" size={18} color={colors.textLight} />
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
            {photoUri ? (
              <View style={styles.composerPhotoRow}>
                <Image source={{ uri: photoUri }} style={styles.composerPhoto} />
                <View style={styles.composerPhotoActions}>
                  <Text style={styles.composerPhotoTitle}>Your sky 📷</Text>
                  <TouchableOpacity onPress={handleSnapSky} style={styles.composerLink}>
                    <Ionicons name="camera-reverse-outline" size={16} color={colors.primaryDark} />
                    <Text style={styles.composerLinkText}>Retake</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setPhotoUri(null)} style={styles.composerLink}>
                    <Ionicons name="trash-outline" size={16} color={colors.textLight} />
                    <Text style={[styles.composerLinkText, { color: colors.textLight }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.snapButton} onPress={handleSnapSky} activeOpacity={0.85}>
                <Text style={styles.snapEmoji}>📷</Text>
                <View style={styles.snapText}>
                  <Text style={styles.snapTitle}>Snap the sky</Text>
                  <Text style={styles.snapSub}>Look up and take a photo of the sky right now</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.primaryDark} />
              </TouchableOpacity>
            )}
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
              placeholderTextColor={colors.textLight}
              value={wishText}
              onChangeText={setWishText}
              maxLength={WISH_MAX}
              autoFocus
            />
            <Text style={styles.noteCount}>
              {wishText.length}/{WISH_MAX}
            </Text>
            <PrimaryButton title="Send it to the sky" icon="sparkles" loading={wishSaving} disabled={!wishText.trim()} onPress={handleMakeWish} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <ReportSheet target={reportTarget} reporterId={user?.id} onClose={() => setReportTarget(null)} />
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
    alignItems: 'flex-start',
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
    color: 'rgba(255,255,255,0.75)',
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
    backgroundColor: colors.cardBg,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,196,120,0.35)',
  },
  wishEmoji: {
    fontSize: 40,
    textAlign: 'center',
  },
  wishSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
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
    color: 'rgba(255,255,255,0.6)',
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
    paddingLeft: spacing.lg,
    gap: 6,
  },
  photoStripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing.lg,
    gap: spacing.sm,
  },
  paintedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.full,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 3,
    flexShrink: 1,
  },
  paintedText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: '#fff',
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
    backgroundColor: colors.primaryLight,
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
    color: colors.textDark,
  },
  snapSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
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
    color: colors.textDark,
  },
  composerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  composerLinkText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primaryDark,
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
    color: colors.textMid,
    textAlign: 'center',
  },
  bottom: {
    backgroundColor: colors.background,
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
