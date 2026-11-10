import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { warmAlert } from './WarmAlert';
import { useToast } from '../contexts/ToastContext';
import { fetchStudentIdQueue, reviewStudentId, studentIdPhotoUrl, type StudentIdRequest } from '../lib/schoolVerificationApi';
import { formatRelativeTime } from '../lib/time';
import { errorMessage } from '../lib/errors';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';

// Why a photo can't confirm the school, shown to the student.
const REJECT_REASONS = [
  "We couldn't see your school's name on it.",
  "It doesn't look like a student ID, schedule or school letter.",
  'The photo was too blurry to read.',
];

function IdPhoto({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    studentIdPhotoUrl(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);
  return url ? (
    <Image source={{ uri: url }} style={styles.photo} resizeMode="contain" accessibilityLabel="School verification photo" />
  ) : (
    <View style={[styles.photo, styles.photoLoading]}>
      <ActivityIndicator color={colors.textLight} />
    </View>
  );
}

// Moderators: student ID photos waiting for a decision. The photo is deleted
// as soon as it's approved or turned down.
export default function StudentIdReview() {
  const { showToast } = useToast();
  const [items, setItems] = useState<StudentIdRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchStudentIdQueue()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  useFocusEffect(load);

  const decide = async (item: StudentIdRequest, approve: boolean, note?: string) => {
    setBusy(item.id);
    try {
      await reviewStudentId(item.id, approve, note);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setItems((list) => list.filter((i) => i.id !== item.id));
      showToast(approve ? 'Verified — photo deleted' : 'Turned down — photo deleted');
    } catch (err) {
      showToast(errorMessage(err, "Couldn't save that — try again"));
    } finally {
      setBusy(null);
    }
  };

  const reject = (item: StudentIdRequest) =>
    warmAlert("Why can't it be confirmed?", 'The student sees this and can try again.', [
      ...REJECT_REASONS.map((r) => ({ text: r, onPress: () => decide(item, false, r) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  if (!items.length) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>School photos to check · {items.length}</Text>
      {items.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.who}>
            {item.full_name || 'Someone'}
            {item.username ? <Text style={styles.handle}> @{item.username}</Text> : null}
          </Text>
          <Text style={styles.meta}>
            says they go to <Text style={styles.school}>{item.school_name}</Text> · {formatRelativeTime(item.created_at)}
          </Text>
          <IdPhoto path={item.photo_path} />
          <View style={styles.actions}>
            {busy === item.id ? (
              <ActivityIndicator color={colors.primaryDark} />
            ) : (
              <>
                <TouchableOpacity style={styles.reject} onPress={() => reject(item)} disabled={!!busy} accessibilityRole="button">
                  <Text style={styles.rejectText}>Can't confirm</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.approve} onPress={() => decide(item, true)} disabled={!!busy} accessibilityRole="button">
                  <Text style={styles.approveText}>Approve</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  },
  heading: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginBottom: spacing.sm,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  who: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  handle: {
    fontFamily: fontFamily.regular,
    color: colors.textMid,
  },
  meta: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: 2,
  },
  school: {
    fontFamily: fontFamily.semibold,
    color: colors.textDark,
  },
  photo: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    marginTop: spacing.sm,
  },
  photoLoading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
    minHeight: 36,
    alignItems: 'center',
  },
  reject: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 3,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rejectText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  approve: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 3,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  approveText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.onPrimary,
  },
});
