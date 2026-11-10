import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import FadeInView from './FadeInView';
import PressableScale from './PressableScale';
import { verificationStage, type SchoolVerification, type VerificationStage } from '../lib/schoolVerification';
import { fetchMySchoolVerification } from '../lib/schoolVerificationApi';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';

// Home's nudge for a student who picked a school but hasn't shown they go
// there yet. Hidden once verified (or before school_verification.sql runs).
type Props = {
  onOpen: () => void;
  // Lets Home hide its "Choose your school" card while a school is picked
  // but not verified yet.
  onStage?: (stage: VerificationStage) => void;
};

export default function VerifySchoolCard({ onOpen, onStage }: Props) {
  const [status, setStatus] = useState<SchoolVerification | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      fetchMySchoolVerification()
        .then((s) => {
          if (!alive) return;
          setStatus(s);
          onStage?.(verificationStage(s));
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [onStage])
  );

  const stage = verificationStage(status);
  if (stage === 'verified' || stage === 'no_school') return null;
  const school = status?.pending_school_name ?? 'your school';
  const copy =
    stage === 'id_pending'
      ? { emoji: '⏳', title: 'Checking your student ID', sub: `A moderator is confirming you go to ${school}.` }
      : stage === 'id_rejected'
        ? { emoji: '🎒', title: 'Let\'s try verifying again', sub: 'Your student ID photo didn\'t work. Tap to try again.' }
        : { emoji: '🎒', title: `Show you go to ${school}`, sub: 'One quick step and your school space opens up.' };

  return (
    <FadeInView>
      <PressableScale style={styles.card} pressedScale={0.98} onPress={onOpen} accessibilityRole="button">
        <Text style={styles.emoji}>{copy.emoji}</Text>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {copy.title}
          </Text>
          <Text style={styles.sub} numberOfLines={2}>
            {copy.sub}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.primaryDark} />
      </PressableScale>
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: spacing.md,
  },
  emoji: {
    fontSize: 26,
  },
  text: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  sub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: 2,
  },
});
