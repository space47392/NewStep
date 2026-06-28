import { useState } from 'react';
import { View, Image, FlatList, TouchableOpacity, NativeSyntheticEvent, NativeScrollEvent, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';

type Props = {
  photoUrls: string[];
  onPressPhoto: (index: number) => void;
};

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
        <FlatList
          data={photoUrls}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(url, i) => `${url}-${i}`}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={(e) => {
                e.stopPropagation();
                onPressPhoto(index);
              }}
            >
              <Image
                source={{ uri: item }}
                style={{ width: containerWidth, height: containerWidth, borderRadius: radius.md }}
              />
            </TouchableOpacity>
          )}
        />
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
});
