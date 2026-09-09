import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { fetchSchoolById } from '../../lib/schools';
import { PUBLIC_PROFILE_FIELDS, PublicProfile } from '../../lib/profile';
import IconInput from '../../components/IconInput';
import InterestPicker from '../../components/InterestPicker';
import PrimaryButton from '../../components/PrimaryButton';
import LoadingScreen from '../../components/LoadingScreen';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';
import { MainStackParamList, School } from '../../types';

const GRADES = ['6th', '7th', '8th', '9th', '10th', '11th', '12th'];

// Everything a user can change about their own identity — split out of
// ProfileScreen (which is now a read-only view, same as UserProfileScreen)
// so "view my profile" and "edit my profile" are two separate destinations,
// like every other profile in this app already behaves for other people.
// Same fields as before, same save path, same RLS — only the screen moved.
export default function EditProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState('');
  const [grade, setGrade] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  // The committed avatar URL — only ever changes after handleSave() actually
  // succeeds (initial load, or a successful save). A picked-but-not-yet-saved
  // photo lives entirely in `pendingAvatar` below instead, so nothing in
  // Storage changes until Save actually commits (Step 42).
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pendingAvatar, setPendingAvatar] = useState<{ uri: string; mimeType?: string } | null>(null);
  const [isNewStudent, setIsNewStudent] = useState<boolean | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);

  // --- Unsaved-changes protection (Step 33) ---------------------------------
  // A snapshot comparison against the fields this screen's own Save button
  // actually writes — deliberately excludes schoolId/selectedSchool, since a
  // school change is saved immediately (and separately) by ChooseSchoolScreen
  // itself, not by this screen's Save; including it here would falsely flag
  // "unsaved changes" for someone who only picked a new school and touched
  // nothing else. null until the initial load completes, so the dirty check
  // never fires against empty placeholder state. pendingAvatar's local uri is
  // included (not avatarUrl, which no longer changes on pick) so picking a
  // new photo and leaving without saving still correctly triggers the
  // discard-changes prompt.
  const initialSnapshotRef = useRef<string | null>(null);
  const isDirtyRef = useRef(false);
  const buildSnapshot = () =>
    JSON.stringify({ fullName, grade, interests, avatarUrl, pendingAvatarUri: pendingAvatar?.uri ?? null, isNewStudent });

  useEffect(() => {
    if (!user) return;

    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(PUBLIC_PROFILE_FIELDS)
        .eq('id', user.id)
        .maybeSingle<PublicProfile>();

      if (error) {
        Alert.alert('Could not load profile', error.message);
      } else if (data) {
        setFullName(data.full_name ?? '');
        setGrade(data.grade ?? '');
        setInterests(data.interests ?? []);
        setAvatarUrl(data.avatar_url ?? null);
        setIsNewStudent(data.is_new_student);
        setSchoolId(data.school_id);
        if (data.school_id) {
          fetchSchoolById(data.school_id)
            .then(setSelectedSchool)
            .catch(() => setSelectedSchool(null));
        }
        // Built straight from the fetched row, not from state — the setters
        // above haven't committed within this closure yet, so reading state
        // here would still see the pre-load placeholder values.
        initialSnapshotRef.current = JSON.stringify({
          fullName: data.full_name ?? '',
          grade: data.grade ?? '',
          interests: data.interests ?? [],
          avatarUrl: data.avatar_url ?? null,
          pendingAvatarUri: null,
          isNewStudent: data.is_new_student,
        });
      }

      setLoadingProfile(false);
    })();
  }, [user]);

  useEffect(() => {
    if (initialSnapshotRef.current === null) return;
    isDirtyRef.current = buildSnapshot() !== initialSnapshotRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullName, grade, interests, avatarUrl, pendingAvatar, isNewStudent]);

  // Registered once — reads isDirtyRef fresh at fire time; fires the same way
  // for the header Back button, swipe-back, and Android hardware back.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      Alert.alert('Discard changes?', 'Your changes will be lost.', [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return unsubscribe;
  }, [navigation]);

  // Re-checked on every focus (not just once) so returning from
  // ChooseSchoolScreen immediately reflects the newly picked school — the
  // rest of the form above is loaded once and left alone so this doesn't
  // clobber an in-progress edit just from navigating away and back.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      (async () => {
        try {
          const { data, error } = await supabase.from('profiles').select('school_id').eq('id', user.id).maybeSingle();
          if (error) throw error;
          const newSchoolId = data?.school_id ?? null;
          setSchoolId(newSchoolId);
          setSelectedSchool(newSchoolId ? await fetchSchoolById(newSchoolId) : null);
        } catch {
          // leave whatever was last shown
        }
      })();
    }, [user])
  );

  // Only stores the local pick as a preview — no Storage write here. That's
  // deferred to handleSave() below, so picking a new photo and then choosing
  // "Discard changes?" never touches the existing avatar file (Step 42).
  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow photo library access to set a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled || !result.assets?.length || !user) return;

    const asset = result.assets[0];
    setPendingAvatar({ uri: asset.uri, mimeType: asset.mimeType });
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    // Still the same fixed path/upsert-overwrite avatars bucket as before —
    // only the timing moved (now inside Save, not inside Pick), so a picked
    // photo the user never saves never reaches Storage at all, and the
    // previously-saved avatar stays exactly as it was until this succeeds.
    let nextAvatarUrl = avatarUrl;
    if (pendingAvatar) {
      setUploadingAvatar(true);
      try {
        const path = `${user.id}/avatar.jpg`;
        const file = new File(pendingAvatar.uri);
        const bytes = await file.bytes();

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, bytes, {
            contentType: pendingAvatar.mimeType ?? 'image/jpeg',
            upsert: true,
          });
        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        // The upload path is fixed per user (upsert overwrite), so the public
        // URL is identical every time — bust it here so every screen that
        // renders this avatar from the DB picks up the new photo instead of
        // a stale cached one.
        nextAvatarUrl = `${data.publicUrl}?v=${Date.now()}`;
      } catch (err) {
        // Nothing else about the profile is saved either — the existing
        // avatar (if any) is left exactly as it was, matching what
        // "Discard changes?" already implies elsewhere on this screen.
        setUploadingAvatar(false);
        setSaving(false);
        const message = err instanceof Error ? err.message : 'Something went wrong.';
        Alert.alert('Upload failed', message);
        return;
      }
      setUploadingAvatar(false);
    }

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      full_name: fullName,
      grade,
      interests,
      avatar_url: nextAvatarUrl,
      is_new_student: isNewStudent,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);

    if (error) {
      Alert.alert('Save failed', error.message);
    } else {
      setAvatarUrl(nextAvatarUrl);
      setPendingAvatar(null);
      // Successful save is an intentional exit — the upcoming goBack()
      // should never trigger the discard-changes prompt.
      isDirtyRef.current = false;
      showToast('Profile updated');
      navigation.goBack();
    }
  };

  if (loadingProfile) {
    return <LoadingScreen />;
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <FadeInView style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Edit Profile</Text>
      </FadeInView>

      <FadeInView style={styles.form} delay={40}>
        <TouchableOpacity style={styles.avatarWrapper} onPress={handlePickAvatar} disabled={uploadingAvatar}>
          {/* A picked-but-not-yet-saved photo previews from its local uri —
              Storage/avatarUrl only change once Save actually succeeds. */}
          {(pendingAvatar?.uri ?? avatarUrl) ? (
            <Image source={{ uri: (pendingAvatar?.uri ?? avatarUrl) as string }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={40} color={colors.primary} />
            </View>
          )}
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={14} color="#fff" />
          </View>
          {uploadingAvatar && (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </TouchableOpacity>

        <Text style={styles.label}>Full Name</Text>
        <IconInput icon="person-outline" placeholder="Alex Johnson" value={fullName} onChangeText={setFullName} autoComplete="name" />

        <Text style={styles.label}>School</Text>
        <View style={styles.schoolCard}>
          <View style={styles.schoolCardRow}>
            <Text style={styles.schoolCardIcon}>🏫</Text>
            <View style={styles.schoolCardText}>
              {selectedSchool ? (
                <>
                  <Text style={styles.schoolCardName}>{selectedSchool.name}</Text>
                  {selectedSchool.city ? (
                    <Text style={styles.schoolCardMeta}>
                      {selectedSchool.city}
                      {selectedSchool.state ? `, ${selectedSchool.state}` : ''}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.schoolCardPlaceholder}>Choose your school</Text>
              )}
            </View>
          </View>
          <PrimaryButton
            title={schoolId ? 'Change School' : 'Choose School'}
            icon="school-outline"
            variant="outline"
            onPress={() => navigation.navigate('ChooseSchool')}
            style={styles.schoolCardButton}
          />
          <Text style={styles.schoolCardNote}>
            Selecting a school links you to its community — it doesn't verify that you attend it.
          </Text>
        </View>

        <Text style={styles.label}>Are you new to this school?</Text>
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={[styles.chip, isNewStudent === true && styles.chipSelected]}
            onPress={() => setIsNewStudent(true)}
          >
            <Text style={[styles.chipText, isNewStudent === true && styles.chipTextSelected]}>Yes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, isNewStudent === false && styles.chipSelected]}
            onPress={() => setIsNewStudent(false)}
          >
            <Text style={[styles.chipText, isNewStudent === false && styles.chipTextSelected]}>Not right now</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Grade</Text>
        <View style={styles.chipRow}>
          {GRADES.map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.chip, grade === g && styles.chipSelected]}
              onPress={() => setGrade(g)}
            >
              <Text style={[styles.chipText, grade === g && styles.chipTextSelected]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Interests</Text>
        <InterestPicker value={interests} onChange={setInterests} />

        <PrimaryButton title="Save Profile" icon="checkmark-outline" onPress={handleSave} loading={saving} style={styles.saveButton} />
      </FadeInView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.md,
  },
  backText: {
    fontFamily: fontFamily.semibold,
    color: colors.primary,
    fontSize: fontSize.md,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xxl,
    color: colors.textDark,
    marginBottom: spacing.lg,
  },
  form: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  avatarWrapper: {
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
  },
  avatarPlaceholder: {
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    alignSelf: 'flex-start',
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  schoolCard: {
    width: '100%',
    backgroundColor: colors.cardBg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  schoolCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  schoolCardIcon: {
    fontSize: 22,
  },
  schoolCardText: {
    flex: 1,
  },
  schoolCardName: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  schoolCardMeta: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
    marginTop: 2,
  },
  schoolCardPlaceholder: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.textLight,
  },
  schoolCardButton: {
    marginBottom: spacing.sm,
  },
  schoolCardNote: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  chipRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: fontFamily.semibold,
    color: colors.textMid,
    fontSize: fontSize.sm,
  },
  chipTextSelected: {
    fontFamily: fontFamily.semibold,
    color: '#fff',
    fontSize: fontSize.sm,
  },
  saveButton: {
    width: '100%',
    marginTop: spacing.xl,
  },
});
