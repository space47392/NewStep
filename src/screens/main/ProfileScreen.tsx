import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import IconInput from '../../components/IconInput';
import PrimaryButton from '../../components/PrimaryButton';
import LoadingScreen from '../../components/LoadingScreen';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';
import { Profile } from '../../types';

const GRADES = ['6th', '7th', '8th', '9th', '10th', '11th', '12th'];

export default function ProfileScreen() {
  const { user, signOut } = useAuth();

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [fullName, setFullName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [grade, setGrade] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [points, setPoints] = useState(0);
  const [username, setUsername] = useState<string | null>(null);

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
        setSchoolName(data.school_name ?? '');
        setGrade(data.grade ?? '');
        setInterests(data.interests ?? []);
        setAvatarUrl(data.avatar_url ?? null);
        setPoints(data.points);
        setUsername(data.username);
      }
      setLoadingProfile(false);
    })();
  }, [user]);

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
      setAvatarUrl(data.publicUrl);
      setAvatarVersion((v) => v + 1); // bust the image cache so the new photo shows immediately
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
      school_name: schoolName,
      grade,
      interests,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);

    if (error) {
      Alert.alert('Save failed', error.message);
    } else {
      Alert.alert('Saved', 'Your profile has been updated.');
    }
  };

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          await signOut();
        },
      },
    ]);
  };

  if (loadingProfile) {
    return <LoadingScreen />;
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <FadeInView style={styles.headerArea}>
        <Text style={styles.title}>My Profile</Text>

        <TouchableOpacity style={styles.avatarWrapper} onPress={handlePickAvatar} disabled={uploadingAvatar}>
          {avatarUrl ? (
            <Image source={{ uri: `${avatarUrl}?v=${avatarVersion}` }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={48} color={colors.primary} />
            </View>
          )}
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
          {uploadingAvatar && (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </TouchableOpacity>

        {username ? <Text style={styles.username}>@{username}</Text> : null}

        <View style={styles.pointsBadge}>
          <Ionicons name="trophy" size={14} color={colors.primary} />
          <Text style={styles.pointsText}>
            {points} {points === 1 ? 'point' : 'points'}
          </Text>
        </View>
      </FadeInView>

      <FadeInView style={styles.form} delay={100}>
        <Text style={styles.label}>Full Name</Text>
        <IconInput icon="person-outline" placeholder="Alex Johnson" value={fullName} onChangeText={setFullName} autoComplete="name" />

        <Text style={styles.label}>School Name</Text>
        <IconInput icon="school-outline" placeholder="Lincoln High School" value={schoolName} onChangeText={setSchoolName} />

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

        <Text style={styles.email}>{user?.email}</Text>
        <PrimaryButton
          title="Log Out"
          icon="log-out-outline"
          variant="destructive"
          onPress={handleLogout}
          loading={loggingOut}
          style={styles.logoutButton}
        />
      </FadeInView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
  },
  headerArea: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  form: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xxl,
    color: colors.textDark,
    marginBottom: spacing.lg,
  },
  avatarWrapper: {
    marginBottom: spacing.md,
  },
  avatar: {
    width: 110,
    height: 110,
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
    width: 32,
    height: 32,
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
  username: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginBottom: spacing.sm,
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.lg,
  },
  pointsText: {
    fontFamily: fontFamily.bold,
    color: colors.primary,
    fontSize: fontSize.sm,
  },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  chipRow: {
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
    marginTop: spacing.xl,
  },
  logoutButton: {
    marginTop: spacing.sm,
  },
  email: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
});
