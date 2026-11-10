import { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { askPermission } from '../../components/askPermission';
import IconInput from '../../components/IconInput';
import PrimaryButton from '../../components/PrimaryButton';
import FadeInView from '../../components/FadeInView';
import ErrorState from '../../components/ErrorState';
import { cleanCode, looksLikeEmail, verificationStage, vouchProgress, type SchoolVerification } from '../../lib/schoolVerification';
import VouchCodeCard from '../../components/verify/VouchCodeCard';
import VouchForClassmate from '../../components/verify/VouchForClassmate';
import {
  confirmSchoolEmailCode,
  emailMatchesMySchool,
  fetchMySchoolVerification,
  sendSchoolEmailCode,
  submitStudentId,
} from '../../lib/schoolVerificationApi';
import { errorMessage } from '../../lib/errors';
import { colors, spacing, radius, fontSize, fontFamily, typography } from '../../constants/theme';
import { MainStackParamList } from '../../types';

// Proving you go to the school you picked, so only real classmates reach
// each other. Three ways, most automatic first: a school email code, two
// verified classmates vouching, or (last resort) a photo a moderator checks
// and then deletes. Verified students vouch for newcomers here too.
export default function VerifySchoolScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [status, setStatus] = useState<SchoolVerification | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const [email, setEmail] = useState('');
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'send' | 'verify' | 'photo' | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await fetchMySchoolVerification());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const stage = verificationStage(status);
  const school = status?.pending_school_name ?? 'your school';

  const sendCode = async () => {
    const address = email.trim();
    if (!looksLikeEmail(address)) {
      setEmailError('That doesn\'t look like an email address.');
      return;
    }
    if (!status?.pending_school_id) return;
    setBusy('send');
    setEmailError(null);
    try {
      if (!(await emailMatchesMySchool(address, status.pending_school_id))) {
        setEmailError(`That isn't a ${school} email. Use the one your school gave you, or your student ID below.`);
        return;
      }
      await sendSchoolEmailCode(address);
      setCodeSentTo(address);
      setCode('');
      showToast('Code sent — check your school inbox');
    } catch (err) {
      setEmailError(errorMessage(err, "Couldn't send the code. Try again in a minute."));
    } finally {
      setBusy(null);
    }
  };

  const verifyCode = async () => {
    if (!codeSentTo || code.length < 6) return;
    setBusy('verify');
    setEmailError(null);
    try {
      await confirmSchoolEmailCode(codeSentTo, code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast(`You're verified at ${school} 🎉`);
      await load();
    } catch (err) {
      setEmailError(errorMessage(err, "That code didn't work. Check it, or send a new one."));
    } finally {
      setBusy(null);
    }
  };

  const sendStudentId = async (from: 'camera' | 'library') => {
    if (!user) return;
    const ok =
      from === 'camera'
        ? await askPermission(ImagePicker.requestCameraPermissionsAsync, 'camera', 'to take a photo of your student ID or schedule')
        : await askPermission(ImagePicker.requestMediaLibraryPermissionsAsync, 'photos', 'to choose a photo of your student ID or schedule');
    if (!ok) return;
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
    const result = from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets?.length) return;
    setBusy('photo');
    try {
      await submitStudentId(user.id, result.assets[0].uri, result.assets[0].mimeType);
      showToast('Sent to a moderator 💛');
      await load();
    } catch (err) {
      showToast(errorMessage(err, "Couldn't send the photo — try again"));
    } finally {
      setBusy(null);
    }
  };

  if (failed && !status) {
    return <ErrorState title="Couldn't load this" subtitle="Check your connection and try again." onRetry={load} />;
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: spacing.xxl + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <FadeInView>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={20} color={colors.textDark} />
          </TouchableOpacity>
          <Text style={styles.title}>{stage === 'verified' ? 'You\'re verified' : `Show you go to ${school}`}</Text>
          <Text style={styles.intro}>
            {stage === 'verified'
              ? 'Your school space is open. Thanks for helping keep it just for classmates 💛'
              : "You can already read your school guide. Verifying opens buddies, classmates, School Sky and lanterns, so only real classmates reach each other."}
          </Text>
        </FadeInView>

        {!loaded ? <ActivityIndicator color={colors.primaryDark} style={{ marginTop: spacing.xl }} /> : null}

        {loaded && stage === 'no_school' ? (
          <PrimaryButton title="Pick your school" icon="school-outline" onPress={() => navigation.navigate('ChooseSchool')} />
        ) : null}

        {loaded && stage === 'verified' ? (
          <View style={[styles.card, styles.doneCard]}>
            <Text style={styles.doneEmoji}>✅</Text>
            <Text style={styles.cardTitle}>All set</Text>
          </View>
        ) : null}
        {loaded && stage === 'verified' ? <VouchForClassmate /> : null}

        {loaded && stage === 'id_pending' ? (
          <View style={[styles.card, styles.noticeCard]}>
            <Text style={styles.cardTitle}>⏳ Your photo is with a moderator</Text>
            <Text style={styles.cardBody}>This can take a few days. Classmates vouching below is usually faster.</Text>
          </View>
        ) : null}

        {loaded && stage === 'id_rejected' ? (
          <View style={[styles.card, styles.warnCard]}>
            <Text style={styles.cardTitle}>That photo didn't work</Text>
            <Text style={styles.cardBody}>{status?.request?.note || 'The moderator couldn\'t confirm your school from it.'} Try again below.</Text>
          </View>
        ) : null}

        {loaded && stage !== 'verified' && stage !== 'no_school' ? (
          <>
            <FadeInView delay={40}>
              <Text style={styles.sectionLabel}>School email</Text>
              <View style={styles.card}>
                {status?.pending_school_has_email ? (
                  codeSentTo ? (
                    <>
                      <Text style={styles.cardBody}>
                        We sent a code to <Text style={styles.strong}>{codeSentTo}</Text>.
                      </Text>
                      <IconInput
                        placeholder="6-digit code"
                        value={code}
                        onChangeText={(t) => setCode(cleanCode(t))}
                        keyboardType="number-pad"
                        autoComplete="one-time-code"
                        maxLength={10}
                      />
                      <PrimaryButton title="Verify" loading={busy === 'verify'} disabled={code.length < 6 || !!busy} onPress={verifyCode} />
                      <TouchableOpacity onPress={() => setCodeSentTo(null)} style={styles.linkButton}>
                        <Text style={styles.link}>Use a different email</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <IconInput
                        placeholder={`Your ${school} email`}
                        value={email}
                        onChangeText={(t) => {
                          setEmail(t);
                          setEmailError(null);
                        }}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoComplete="email"
                      />
                      <PrimaryButton title="Send me a code" icon="mail-outline" loading={busy === 'send'} disabled={!email.trim() || !!busy} onPress={sendCode} />
                    </>
                  )
                ) : (
                  <Text style={styles.cardBody}>We don't have {school}'s email yet, so ask classmates below for now.</Text>
                )}
                {emailError ? <Text style={styles.error}>{emailError}</Text> : null}
              </View>
            </FadeInView>

            <FadeInView delay={60}>
              <Text style={styles.sectionLabel}>No school email? Ask two classmates</Text>
              <VouchCodeCard schoolName={school} {...vouchProgress(status)} />
            </FadeInView>

            <FadeInView delay={80}>
              <Text style={styles.sectionLabel}>Can't reach classmates yet? Send a photo</Text>
              <View style={styles.card}>
                <Text style={styles.cardBody}>
                  Your <Text style={styles.strong}>student ID, class schedule or enrollment letter</Text> works. Just new? Your schedule is fine. A person checks that it shows {school}, so it can take a few days. The photo is <Text style={styles.strong}>deleted right away</Text> after. Only the moderator sees it. Feel free to cover ID numbers.
                </Text>
                {busy === 'photo' ? (
                  <ActivityIndicator color={colors.primaryDark} style={{ marginVertical: spacing.md }} />
                ) : (
                  <View style={styles.photoButtons}>
                    <PrimaryButton title="Take a photo" icon="camera-outline" variant="outline" size="sm" disabled={!!busy} onPress={() => sendStudentId('camera')} style={styles.flex1} />
                    <PrimaryButton title="Choose photo" icon="image-outline" variant="outline" size="sm" disabled={!!busy} onPress={() => sendStudentId('library')} style={styles.flex1} />
                  </View>
                )}
              </View>
            </FadeInView>

            <TouchableOpacity onPress={() => navigation.navigate('ChooseSchool')} style={styles.linkButton}>
              <Text style={styles.link}>Picked the wrong school? Change it</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex1: {
    flex: 1,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.largeTitle,
    color: colors.textDark,
  },
  intro: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    lineHeight: 22,
    color: colors.textMid,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  noticeCard: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
    marginBottom: spacing.sm,
  },
  warnCard: {
    borderColor: colors.error,
    marginBottom: spacing.sm,
  },
  doneCard: {
    alignItems: 'center',
  },
  doneEmoji: {
    fontSize: 36,
  },
  cardTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  cardBody: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.textMid,
  },
  strong: {
    fontFamily: fontFamily.semibold,
    color: colors.textDark,
  },
  error: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.error,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  linkButton: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  link: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.primaryDark,
  },
});
