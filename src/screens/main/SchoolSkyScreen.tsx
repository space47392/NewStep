import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Animated, Easing, Image, StyleSheet, useAnimatedValue } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import SkyScene, { Horizon, skyPhase, phaseWords, DescribedSkyLook, landColors, PHASE_SKY } from '../../components/SkyScene';
import { extractSkyPalette, paintSky, SkyPalette } from '../../lib/skyColors';
import SkyWeather from '../../components/SkyWeather';
import { hasBlockedWords, KIND_WORDS_MESSAGE } from '../../lib/contentFilter';
import { fetchLanterns, Lantern } from '../../lib/lanterns';
import { soundsLikeCrisis } from '../../lib/crisis';
import { useWarmSheet } from '../../components/WarmSheet';
import MoodFace from '../../components/MoodFace';
import { warmAlert } from '../../components/WarmAlert';
import { useTilt } from '../../lib/useTilt';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchSchoolSky, setMyStar, removeMyStar, fetchSkyDiary, uploadSkyPhoto, removeSkyPhoto, sharedSky, blendDescribedSky, THING_EMOJI, fetchTodayTwinkles, sendTwinkle, fetchWishes, makeWish, cheerWish, deleteWish, reportWish, dominantMoods, moodWeather, weatherLine, constellationName, TwinkleSummary, SkyWish, starPosition, skyMood, SkyMood, SkyStar } from '../../lib/sky';
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
import SkyGallery from '../../components/sky/SkyGallery';
import WishSheet from '../../components/sky/WishSheet';
import StarComposer from '../../components/sky/StarComposer';
import { useStarDraft } from '../../lib/useStarDraft';
import { CatchableStar, Constellation, FloatingLantern, WishLight } from '../../components/sky/SkyFloaters';
import SkyStarButton from '../../components/sky/SkyStarButton';


// One-tap warm words for a classmate's star, fitting how they feel.
const WARM_WORDS: Record<SkyMood, string[]> = {
  happy: ['Love this ✨', 'So happy for you!'],
  excited: ['Yay! 🎉', 'Tell me everything!'],
  chill: ['Love that calm 🌿', 'Enjoy it!'],
  nervous: ["You've got this 💪", 'Rooting for you'],
  tired: ['Rest well 🌙', 'Proud of you today'],
  down: ['Here for you 💛', 'Sending a hug 🫂'],
};

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
  // The star being written in the composer.
  const draft = useStarDraft(phase);

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
  // Bumped after saving, so my star rises into the sky.
  const [placedKey, setPlacedKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  // A gentle moment after a heavy star (see CareSheet), and the breathing minute.
  const [care, setCare] = useState<Care | null>(null);
  const [breatheOpen, setBreatheOpen] = useState(false);
  // Warm words already sent to a star today (this visit), by user id.
  const [warmthSent, setWarmthSent] = useState<Record<string, string>>({});
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
    setWishOpen(true);
  };

  const handleMakeWish = async (wishText: string) => {
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
    draft.fillFrom(myStar);
    setSelectedId(null);
    setComposerOpen(true);
  };

  // The composer can open straight from Home ("Add your star"); fill it in
  // once the current star has loaded.
  const prefilledRef = useRef(false);
  const fillDraft = draft.fillFrom;
  useEffect(() => {
    if (!composerOpen || prefilledRef.current || loading) return;
    prefilledRef.current = true;
    if (myStar) fillDraft(myStar);
  }, [composerOpen, loading, myStar, fillDraft]);

  // Their own words, painted: the sheet steps aside to preview the sky.
  const handlePaint = async () => {
    if (await draft.paint()) setPreviewing(true);
  };

  const handleSave = async (confirmedCrisis = false) => {
    if (saving || !user) return;
    const { mood, note, photoUri, photoIsNew, skyText, skyScene } = draft;
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
    previewing && draft.skyScene ? { colors: draft.skyScene.colors, clouds: draft.skyScene.clouds, cloudColor: draft.skyScene.cloud_color } : null;
  const shownThings = previewing && draft.skyScene ? draft.skyScene.things : shared.things;
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

      {previewing && draft.skyScene ? (
        <View style={[styles.previewBar, { paddingBottom: insets.bottom + spacing.md, backgroundColor: land.ground }]}>
          <Text style={styles.previewEyebrow}>✨ This is the sky you described</Text>
          <Text style={styles.previewTitle}>
            {draft.skyScene.title} {draft.skyScene.things.map((t) => THING_EMOJI[t]).join('')}
          </Text>
          <Text style={styles.previewDesc} numberOfLines={2}>
            “{draft.skyText.trim()}”
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

      <StarComposer
        visible={composerOpen && !previewing}
        draft={draft}
        isUpdate={!!myStar}
        saving={saving}
        onClose={() => setComposerOpen(false)}
        onSave={() => handleSave()}
        onPaint={handlePaint}
        onLantern={() => {
          setComposerOpen(false);
          navigation.navigate('Lanterns', { compose: true });
        }}
        onBreathe={() => setBreatheOpen(true)}
      />
      {/* Mounted only while open, so every caught star starts a blank wish. */}
      {wishOpen ? <WishSheet saving={wishSaving} onClose={() => setWishOpen(false)} onSubmit={handleMakeWish} /> : null}
      <SkyGallery
        visible={galleryOpen}
        stars={stars}
        myUserId={user?.id}
        onClose={() => setGalleryOpen(false)}
        onPick={(userId) => {
          setGalleryOpen(false);
          setSelectedWishId(null);
          setSelectedId(userId);
        }}
      />
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
  sceneText: {
    flex: 1,
    gap: 2,
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
  cardPhoto: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
  },
  reportButton: {
    justifyContent: 'center',
    paddingHorizontal: 4,
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
});
