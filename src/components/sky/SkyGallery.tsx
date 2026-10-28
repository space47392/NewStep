import { View, Text, TouchableOpacity, Modal, Image, ScrollView, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import MoodFace from '../MoodFace';
import { colors, spacing, fontSize, fontFamily, dark } from '../../constants/theme';
import type { SkyStar } from '../../lib/sky';

type Props = {
  visible: boolean;
  stars: SkyStar[];
  myUserId?: string;
  onClose: () => void;
  // Tapping a photo finds that classmate's star in the sky.
  onPick: (userId: string) => void;
};

// "Today's real sky": the photos today's sky was painted from.
export default function SkyGallery({ visible, stars, myUserId, onClose, onPick }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.galleryBackdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
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
                  onPick(st.user_id);
                }}
                style={[styles.galleryCard, { transform: [{ rotate: i % 2 === 0 ? '-3deg' : '2.5deg' }] }]}
                accessibilityRole="button"
                accessibilityLabel={`Sky photo from ${st.user_id === myUserId ? 'you' : st.profile?.full_name ?? 'a classmate'}`}
              >
                <Image source={{ uri: st.photo_url! }} style={styles.galleryPhoto} />
                <View style={[styles.moodLine, styles.moodLineCenter]}>
                  <MoodFace mood={st.mood} size={20} />
                  <Text style={[styles.galleryCaption, styles.galleryCaptionInline]} numberOfLines={1}>
                    {st.user_id === myUserId ? 'You' : st.profile?.full_name?.trim().split(/\s+/)[0] ?? ''}
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
  );
}

const styles = StyleSheet.create({
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
  galleryRail: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.lg,
  },
  galleryCaptionInline: {
    marginTop: 0,
    flexShrink: 1,
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
});
