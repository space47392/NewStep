import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Avatar from '../Avatar';
import IconInput from '../IconInput';
import PrimaryButton from '../PrimaryButton';
import { useToast } from '../../contexts/ToastContext';
import { cleanVouchCode, VOUCH_CODE_LENGTH } from '../../lib/schoolVerification';
import { previewVouch, vouchForClassmate, type VouchPreview } from '../../lib/schoolVerificationApi';
import { errorMessage } from '../../lib/errors';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';

// For a verified student: enter a new classmate's code, check it's really
// them, and confirm they go to your school.
export default function VouchForClassmate() {
  const { showToast } = useToast();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<VouchPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'look' | 'vouch' | null>(null);

  const reset = () => {
    setCode('');
    setPreview(null);
    setError(null);
  };

  const lookUp = async () => {
    setBusy('look');
    setError(null);
    try {
      setPreview(await previewVouch(code));
    } catch (err) {
      setError(errorMessage(err, "Couldn't check that code."));
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy('vouch');
    try {
      const result = await vouchForClassmate(code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const first = preview.full_name?.trim().split(/\s+/)[0] ?? 'They';
      showToast(result === 'verified' ? `${first} is in! Thanks for welcoming them 💛` : `Thanks! ${first} needs one more classmate.`);
      reset();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save that — try again."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Vouch for a new classmate</Text>
      <Text style={styles.body}>
        Someone new at your school can ask two classmates to confirm they go there. Only vouch for someone you know is really at your
        school.
      </Text>

      {preview ? (
        <>
          <View style={styles.person}>
            <Avatar uri={preview.avatar_url} size={44} />
            <View style={styles.personText}>
              <Text style={styles.name}>{preview.full_name || 'No name yet'}</Text>
              <Text style={styles.meta}>
                {preview.username ? `@${preview.username} · ` : ''}says they go to {preview.school_name}
              </Text>
            </View>
          </View>
          {preview.already_vouched ? (
            <Text style={styles.body}>You've already vouched for them. Thanks!</Text>
          ) : (
            <PrimaryButton title="Yes, they go to my school" icon="checkmark" loading={busy === 'vouch'} disabled={!!busy} onPress={confirm} />
          )}
          <PrimaryButton title="Not them / cancel" variant="outline" size="sm" disabled={!!busy} onPress={reset} />
        </>
      ) : (
        <>
          <IconInput
            placeholder="Their 6-letter code"
            value={code}
            onChangeText={(t) => {
              setCode(cleanVouchCode(t));
              setError(null);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
          />
          <PrimaryButton title="Check code" loading={busy === 'look'} disabled={code.length < VOUCH_CODE_LENGTH || !!busy} onPress={lookUp} />
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
    marginTop: spacing.lg,
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.textMid,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
  },
  personText: {
    flex: 1,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  meta: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  error: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.error,
  },
});
