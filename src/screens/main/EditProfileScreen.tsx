import { useCallback, useEffect, useState } from 'react';
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
import IconInput from '../../components/IconInput';
import PrimaryButton from '../../components/PrimaryButton';
import LoadingScreen from '../../components/LoadingScreen';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';
import { MainStackParamList, Profile, School } from '../../types';

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
  const [interestInput, setInterestInput] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isNewStudent, setIsNewStudent] = useState<boolean | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);

  useEffect(() => {
    if (!user) return;

    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle<Profile>();

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
      }

      setLoadingProfile(false);
    })();
  }, [user]);

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

    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const file = new File(asset.uri);
      const bytes = await file.bytes();
      const path = `${user.id}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, bytes, {
          contentType: asset.mimeType ?? 'image/jpeg',
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      // The upload path is fixed per user (upsert overwrite), so the public URL
      // is identical every time — bust it here, before it's saved, so every
      // screen that renders this avatar from the DB (not just this preview)
      // picks up the new photo instead of a stale cached one.
      setAvatarUrl(`${data.publicUrl}?v=${Date.now()}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      Alert.alert('Upload failed', message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAddInterest = () => {
    const trimmed = interestInput.trim();
    if (!trimmed || interests.includes(trimmed)) {
      setInterestInput('');
      return;
    }
    setInterests([...interests, trimmed]);
    setInterestInput('');
  };

  const handleRemoveInterest = (interest: string) => {
    setInterests(interests.filter((i) => i !== interest));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      full_name: fullName,
      grade,
      interests,
      avatar_url: avatarUrl,
      is_new_student: isNewStudent,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);

    if (error) {
      Alert.alert('Save failed', error.message);
    } else {
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
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
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
        <View style={styles.interestInputRow}>
          <IconInput
            icon="sparkles-outline"
            style={styles.interestInput}
            placeholder="e.g. Basketball"
            value={interestInput}
            onChangeText={setInterestInput}
            onSubmitEditing={handleAddInterest}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.addButton} onPress={handleAddInterest}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.chipRow}>
          {interests.map((interest) => (
            <TouchableOpacity
              key={interest}
              style={[styles.chip, styles.chipSelected]}
              onPress={() => handleRemoveInterest(interest)}
            >
              <Text style={styles.chipTextSelected}>{interest} ✕</Text>
            </TouchableOpacity>
          ))}
        </View>

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
  interestInputRow: {
    width: '100%',
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  interestInput: {
    flex: 1,
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    width: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButton: {
    width: '100%',
    marginTop: spacing.xl,
  },
});
