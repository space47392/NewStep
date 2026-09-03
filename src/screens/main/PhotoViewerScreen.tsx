import { useState } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator, useWindowDimensions, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radius, fontSize, fontFamily } from '../../constants/theme';
import { MainStackParamList } from '../../types';

export default function PhotoViewerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'PhotoViewer'>>();
  const { photoUrls, initialIndex } = route.params;
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);
  const [loaded, setLoaded] = useState(false);

  const hasMultiple = photoUrls.length > 1;

  const handleSetIndex = (nextIndex: number) => {
    setLoaded(false);
    setIndex(nextIndex);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {/* key forces a remount on photo change, resetting pan/zoom instead of carrying it over */}
      <ScrollView
        key={index}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        maximumZoomScale={3}
        minimumZoomScale={1}
        centerContent
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={{ uri: photoUrls[index] }}
          style={{ width, height }}
          resizeMode="contain"
          onLoad={() => setLoaded(true)}
        />
      </ScrollView>

      {!loaded && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color="#fff" />
        </View>
      )}

      <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
        <Ionicons name="close" size={26} color="#fff" />
      </TouchableOpacity>

      {hasMultiple && (
        <View style={styles.counter}>
          <Text style={styles.counterText}>
            {index + 1} / {photoUrls.length}
          </Text>
        </View>
      )}

      {/* Small chevron buttons rather than full-screen swipe — leaves the whole
          image surface free for pinch/pan instead of fighting an outer swiper. */}
      {hasMultiple && index > 0 && (
        <TouchableOpacity style={styles.navButtonLeft} onPress={() => handleSetIndex(index - 1)}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
      )}
      {hasMultiple && index < photoUrls.length - 1 && (
        <TouchableOpacity style={styles.navButtonRight} onPress={() => handleSetIndex(index + 1)}>
          <Ionicons name="chevron-forward" size={26} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.md,
    padding: spacing.xs,
  },
  counter: {
    position: 'absolute',
    top: spacing.xl + 4,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  counterText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: '#fff',
  },
  navButtonLeft: {
    position: 'absolute',
    left: spacing.sm,
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonRight: {
    position: 'absolute',
    right: spacing.sm,
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
