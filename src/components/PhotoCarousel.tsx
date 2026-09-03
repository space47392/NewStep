import { useState } from 'react';
import {
  View,
  Image,
  FlatList,
  Text,
  TouchableOpacity,
  GestureResponderEvent,
  NativeSyntheticEvent,
  NativeScrollEvent,
  StyleSheet,
} from 'react-native';
import { colors, radius, spacing, fontSize, fontFamily } from '../constants/theme';
import { Skeleton } from './Skeleton';

type Props = {
  photoUrls: string[];
  onPressPhoto: (index: number) => void;
};

// One photo tile with its own loaded state, so a slow-loading later photo in
// the carousel doesn't hold up (or get conflated with) an already-loaded one.
function CarouselPhoto({
  uri,
  size,
  onPress,
}: {
  uri: string;
  size: number;
  onPress: (e: GestureResponderEvent) => void;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
      <View style={{ width: size, height: size, borderRadius: radius.md, overflow: 'hidden' }}>
        {!loaded && <Skeleton width={size} height={size} radius={0} style={StyleSheet.absoluteFill} />}
        <Image source={{ uri }} style={{ width: size, height: size }} onLoad={() => setLoaded(true)} />
      </View>
    </TouchableOpacity>
  );
}

export default function PhotoCarousel({ photoUrls, onPressPhoto }: Props) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  if (photoUrls.length === 0) return null;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (containerWidth === 0) return;
    const index = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
    setActiveIndex(index);
  };

  return (
    <View onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
      {containerWidth > 0 && (
        <View>
          <FlatList
            data={photoUrls}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(url, i) => `${url}-${i}`}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            renderItem={({ item, index }) => (
              <CarouselPhoto
                uri={item}
                size={containerWidth}
                onPress={(e) => {
                  e.stopPropagation();
                  onPressPhoto(index);
                }}
              />
            )}
          />
          {photoUrls.length > 1 && (
            <View style={styles.counterBadge}>
              <Text style={styles.counterText}>
                {activeIndex + 1}/{photoUrls.length}
              </Text>
            </View>
          )}
        </View>
      )}
      {photoUrls.length > 1 && (
        <View style={styles.dots}>
          {photoUrls.map((url, i) => (
            <View key={url} style={[styles.dot, i === activeIndex && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
  counterBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  counterText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: '#fff',
  },
});
