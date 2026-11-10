import { useEffect, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, View } from 'react-native';
import PrimaryButton from '../PrimaryButton';
import { fetchMyVouchCode } from '../../lib/schoolVerificationApi';
import { errorMessage } from '../../lib/errors';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';

type Props = {
  schoolName: string;
  have: number;
  need: number;
};

// For a student waiting on verification: their code, and how many classmates
// have confirmed so far. Classmates enter it in their own app.
export default function VouchCodeCard({ schoolName, have, need }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMyVouchCode()
      .then((c) => alive && setCode(c))
      .catch((err) => alive && setError(errorMessage(err, "Couldn't get your code.")));
    return () => {
      alive = false;
    };
  }, []);

  const share = () => {
    if (!code) return;
    Share.share({
      message: `Can you vouch that I go to ${schoolName} on NewStep? Open NewStep → Settings → Vouch for a classmate, and enter my code: ${code}`,
    }).catch(() => {});
  };

  return (
    <View style={styles.card}>
      <Text style={styles.body}>
        Ask <Text style={styles.strong}>{need} classmates</Text> who already use NewStep (a buddy, someone in your class) to enter this code
        in their app. No ID needed.
      </Text>
      {code ? (
        <Text style={styles.code} selectable accessibilityLabel={`Your code: ${code.split('').join(' ')}`}>
          {code}
        </Text>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ActivityIndicator color={colors.primaryDark} style={{ marginVertical: spacing.md }} />
      )}
      <View style={styles.progress} accessible accessibilityLabel={`${have} of ${need} classmates confirmed`}>
        {Array.from({ length: need }, (_, i) => (
          <View key={i} style={[styles.dot, i < have && styles.dotOn]}>
            <Text style={[styles.dotText, i < have && styles.dotTextOn]}>{i < have ? '✓' : i + 1}</Text>
          </View>
        ))}
        <Text style={styles.progressText}>
          {have === 0 ? 'No one yet' : `${have} of ${need} confirmed`}
        </Text>
      </View>
      <PrimaryButton title="Send my code" icon="share-outline" variant="outline" size="sm" disabled={!code} onPress={share} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.textMid,
  },
  strong: {
    fontFamily: fontFamily.semibold,
    color: colors.textDark,
  },
  code: {
    fontFamily: fontFamily.bold,
    fontSize: 34,
    letterSpacing: 8,
    textAlign: 'center',
    color: colors.textDark,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    overflow: 'hidden',
  },
  error: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.error,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dotText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  dotTextOn: {
    color: colors.onPrimary,
  },
  progressText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
});
