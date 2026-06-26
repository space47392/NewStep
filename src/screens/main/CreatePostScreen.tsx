import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../contexts/AuthContext';
import { createPost } from '../../lib/posts';
import { colors, spacing, radius, fontSize } from '../../constants/theme';
import { MainStackParamList, PostCategory } from '../../types';

const CATEGORIES: PostCategory[] = ['Need Help', 'School Question', 'Looking for Friends'];

export default function CreatePostScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user } = useAuth();

  const [content, setContent] = useState('');
  const [category, setCategory] = useState<PostCategory>('Looking for Friends');
  const [posting, setPosting] = useState(false);

  const handlePost = async () => {
    if (!content.trim()) {
      Alert.alert('Empty post', 'Write something before posting.');
      return;
    }
    if (!user) return;

    setPosting(true);
    try {
      await createPost({ authorId: user.id, content: content.trim(), category });
      navigation.goBack();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      Alert.alert('Could not post', message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New Post</Text>
        <View style={styles.cancelSpacer} />
      </View>

      <Text style={styles.label}>Category</Text>
      <View style={styles.chipRow}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.chip, category === c && styles.chipSelected]}
            onPress={() => setCategory(c)}
          >
            <Text style={[styles.chipText, category === c && styles.chipTextSelected]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>What's on your mind?</Text>
      <TextInput
        style={styles.textArea}
        placeholder="Share something with your school community..."
        placeholderTextColor={colors.textLight}
        value={content}
        onChangeText={setContent}
        multiline
        textAlignVertical="top"
      />

      <TouchableOpacity
        style={[styles.postButton, posting && styles.buttonDisabled]}
        onPress={handlePost}
        disabled={posting}
      >
        {posting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Post</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  cancel: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  cancelSpacer: {
    width: 50,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textDark,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.lg,
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
  textArea: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.textDark,
    minHeight: 140,
  },
  postButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '700',
  },
});
