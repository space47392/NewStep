import { useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, useAnimatedValue, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Defs, RadialGradient, LinearGradient, Rect, Circle, Stop } from 'react-native-svg';
import MoodFace from '../MoodFace';
import { tiltTransform, Tilt } from '../../lib/useTilt';
import { starPosition, skyMood, SkyStar } from '../../lib/sky';
import { colors, fontFamily } from '../../constants/theme';

const SPARKLE = 'M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z';

// One classmate's star: a four-point sparkle in their mood colour with a
// soft halo, rising into place when the sky opens. The mood emoji only
// shows once the star is tapped.
export default function SkyStarButton({
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

const styles = StyleSheet.create({
  starWrap: {
    position: 'absolute',
    width: 84,
    marginLeft: -42,
    alignItems: 'center',
  },
  halo: {
    position: 'absolute',
  },
  twinkleCount: {
    color: colors.sticker.yellow,
    fontFamily: fontFamily.semibold,
  },
  burst: {
    position: 'absolute',
    top: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
  },
  rays: {
    position: 'absolute',
  },
  trail: {
    position: 'absolute',
    width: 10,
    height: 150,
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
});
