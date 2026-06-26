import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { colors, spacing, radius, fontSize } from '../../constants/theme';
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
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>My Profile</Text>
      <View style={styles.pointsBadge}>
        <Text style={styles.pointsText}>🏆 {points} {points === 1 ? 'point' : 'points'}</Text>
      </View>

      <TouchableOpacity style={styles.avatarWrapper} onPress={handlePickAvatar} disabled={uploadingAvatar}>
        {avatarUrl ? (
          <Image source={{ uri: `${avatarUrl}?v=${avatarVersion}` }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarPlaceholderText}>Add Photo</Text>
          </View>
        )}
        {uploadingAvatar && (
          <View style={styles.avatarOverlay}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </TouchableOpacity>

      <Text style={styles.label}>Full Name</Text>
      <TextInput
        style={styles.input}
        placeholder="Alex Johnson"
        placeholderTextColor={colors.textLight}
        value={fullName}
        onChangeText={setFullName}
        autoComplete="name"
      />

      <Text style={styles.label}>School Name</Text>
      <TextInput
        style={styles.input}
        placeholder="Lincoln High School"
        placeholderTextColor={colors.textLight}
        value={schoolName}
        onChangeText={setSchoolName}
      />

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
        <TextInput
          style={[styles.input, styles.interestInput]}
          placeholder="e.g. Basketball"
          placeholderTextColor={colors.textLight}
          value={interestInput}
          onChangeText={setInterestInput}
          onSubmitEditing={handleAddInterest}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.addButton} onPress={handleAddInterest}>
          <Text style={styles.addButtonText}>Add</Text>
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

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Profile</Text>}
      </TouchableOpacity>

      <Text style={styles.email}>{user?.email}</Text>
      <TouchableOpacity
        style={[styles.logoutButton, loggingOut && styles.buttonDisabled]}
        onPress={handleLogout}
        disabled={loggingOut}
      >
        {loggingOut ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log Out</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    alignItems: 'center',
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textDark,
    marginBottom: spacing.lg,
  },
  pointsBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.lg,
  },
  pointsText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  avatarWrapper: {
    marginBottom: spacing.lg,
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarPlaceholderText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
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
    width: '100%',
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textDark,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  input: {
    width: '100%',
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.textDark,
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
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textMid,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
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
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  saveButton: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  logoutButton: {
    width: '100%',
    backgroundColor: colors.error,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  email: {
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: spacing.xl,
  },
});
