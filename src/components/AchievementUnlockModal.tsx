import { useEffect, useRef } from 'react';
import { View, Text, Modal, Animated, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import PrimaryButton from './PrimaryButton';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../constants/theme';
import { AchievementProgress } from '../types';

type Props = {
  achievement: AchievementProgress | null;
  onClose: () => void;
};

// The sticker "slaps" onto the card — drops in big and tilted, then settles —
// the same sticker look as AchievementStickers on the profile.
export default function AchievementUnlockModal({ achievement, onClose }: Props) {
  const drop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!achievement) return;
    drop.setValue(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.spring(drop, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }).start();
  }, [achievement, drop]);

  return (
    <Modal visible={!!achievement} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {achievement && (
          <View style={styles.card} accessibilityViewIsModal>
            <Text style={styles.kicker}>NEW STICKER!</Text>
            <Animated.View
              style={[
                styles.sticker,
                {
                  opacity: drop.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
                  transform: [
                    { scale: drop.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] }) },
                    { rotate: drop.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '-6deg'] }) },
                  ],
                },
              ]}
            >
              <Text style={styles.icon}>{achievement.icon}</Text>
            </Animated.View>
            <Text style={styles.name}>{achievement.name}</Text>
            <Text style={styles.description}>Unlocked by: {achievement.description}</Text>
            <PrimaryButton title="Stick it on my profile" onPress={onClose} style={styles.button} />
          </View>
        )}
      </View>
    </Modal>
  );
}

const STICKER = 112;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 18, 40, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  kicker: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.xs,
    color: colors.secondaryDark,
    letterSpacing: 1.5,
    marginBottom: spacing.lg,
  },
  sticker: {
    width: STICKER,
    height: STICKER,
    borderRadius: STICKER / 2,
    backgroundColor: colors.warningLight,
    borderWidth: 5,
    borderColor: colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  icon: {
    fontSize: 54,
  },
  name: {
    marginTop: spacing.lg,
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xl,
    color: colors.textDark,
    textAlign: 'center',
  },
  description: {
    marginTop: spacing.xs,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    marginTop: spacing.xl,
  },
});
