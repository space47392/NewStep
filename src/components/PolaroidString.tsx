import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, fontFamily, radius } from '../constants/theme';

// Today's real-sky photos, hung like polaroids on a string of fairy
// lights across the top of the School Sky. Each one sways gently from its
// clip, a little tilted, with the mood and a first name written on the
// white border.

export type PolaroidItem = {
  id: string;
  uri: string;
  caption: string;
  selected: boolean;
};

const CARD_W = 66;
const PHOTO_H = 72;
const SPACING = 86;
const STRING_Y = 14;
const SAG = 10;

function seeded(n: number) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function FairyLight({ x, y, i }: { x: number; y: number; i: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay((i * 330) % 1500),
        Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t, i]);
  const warm = ['#FFD45C', '#FFB3C7', '#9FE8FF', '#C9B8FF'][i % 4];
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.light,
        { left: x - 4, top: y - 1, backgroundColor: warm, shadowColor: warm },
        { opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) },
      ]}
    />
  );
}

function Polaroid({ item, index, x, onPress }: { item: PolaroidItem; index: number; x: number; onPress: () => void }) {
  const sway = useRef(new Animated.Value(0)).current;
  const tilt = (seeded(index + 1) - 0.5) * 10; // −5° … +5°
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: 2400 + index * 300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(sway, { toValue: -1, duration: 2400 + index * 300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [sway, index]);
  const cardH = PHOTO_H + 26;
  // Swing from the clip at the top: shift the pivot up, rotate, shift back.
  const rotate = sway.interpolate({ inputRange: [-1, 1], outputRange: [`${tilt - 3}deg`, `${tilt + 3}deg`] });
  return (
    <Animated.View
      style={[
        styles.polaroidWrap,
        { left: x - CARD_W / 2, top: STRING_Y + SAG * 0.6 },
        { transform: [{ translateY: -cardH / 2 }, { rotate }, { translateY: cardH / 2 }] },
      ]}
    >
      <View style={styles.clip} />
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        style={[styles.polaroid, item.selected && styles.polaroidSelected]}
        accessibilityRole="button"
        accessibilityLabel={`Sky photo, ${item.caption}`}
      >
        <Image source={{ uri: item.uri }} style={styles.photo} />
        <Text style={styles.caption} numberOfLines={1}>
          {item.caption}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function PolaroidString({ items, onPressItem }: { items: PolaroidItem[]; onPressItem: (id: string) => void }) {
  const { width } = useWindowDimensions();
  const contentW = Math.max(width, items.length * SPACING + 40);
  const xs = items.map((_, i) => 40 + i * SPACING + CARD_W / 2);
  // The string sags between the two ends of the row.
  const d = `M0 ${STRING_Y} Q ${contentW / 2} ${STRING_Y + SAG * 2} ${contentW} ${STRING_Y}`;
  const lightXs = Array.from({ length: Math.ceil(contentW / 44) }, (_, i) => 22 + i * 44).filter(
    (lx) => !xs.some((px) => Math.abs(px - lx) < 18)
  );
  // y on the quadratic curve at a given x (t ≈ x / width for this shape).
  const yAt = (x: number) => {
    const t = x / contentW;
    return (1 - t) * (1 - t) * STRING_Y + 2 * (1 - t) * t * (STRING_Y + SAG * 2) + t * t * STRING_Y;
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={{ width: contentW, height: 130 }}>
      <Svg width={contentW} height={40} style={StyleSheet.absoluteFill}>
        <Path d={d} stroke="rgba(255,255,255,0.35)" strokeWidth={1.2} fill="none" />
      </Svg>
      {lightXs.map((lx, i) => (
        <FairyLight key={i} x={lx} y={yAt(lx)} i={i} />
      ))}
      {items.map((item, i) => (
        <Polaroid key={item.id} item={item} index={i} x={xs[i]} onPress={() => onPressItem(item.id)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  light: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOpacity: 1,
    shadowRadius: 6,
  },
  polaroidWrap: {
    position: 'absolute',
    width: CARD_W,
    alignItems: 'center',
  },
  clip: {
    width: 8,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#E8C9A0',
    marginBottom: -5,
    zIndex: 2,
  },
  polaroid: {
    width: CARD_W,
    backgroundColor: '#FBF8F1',
    borderRadius: 3,
    padding: 4,
    paddingBottom: 3,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  polaroidSelected: {
    borderWidth: 2,
    borderColor: colors.sticker.yellow,
  },
  photo: {
    width: '100%',
    height: PHOTO_H,
    borderRadius: radius.sm / 4,
    backgroundColor: '#ddd',
  },
  caption: {
    fontFamily: fontFamily.brand,
    fontSize: 10,
    color: '#3B3557',
    textAlign: 'center',
    marginTop: 3,
  },
});
