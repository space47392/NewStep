import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { createPost } from '../../lib/posts';
import PrimaryButton from '../../components/PrimaryButton';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';
import { CATEGORY_STYLES } from '../../constants/categoryStyles';
import { MainStackParamList, PostCategory } from '../../types';

const CATEGORIES: PostCategory[] = ['Need Help', 'School Question', 'Looking for Friends'];
const MAX_LENGTH = 500;

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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Ionicons name="close" size={22} color={colors.textMid} />
        </TouchableOpacity>
        <Text style={styles.title}>New Post</Text>
        <View style={styles.closeSpacer} />
      </View>

      <FadeInView>
        <Text style={styles.label}>Category</Text>
        <View style={styles.chipRow}>
          {CATEGORIES.map((c) => {
            const style = CATEGORY_STYLES[c];
            const selected = category === c;
            return (
              <TouchableOpacity
                key={c}
                style={[
                  styles.chip,
                  { borderColor: selected ? style.text : colors.border, backgroundColor: selected ? style.text : colors.cardBg },
                ]}
                onPress={() => setCategory(c)}
              >
                <Ionicons name={style.icon} size={14} color={selected ? '#fff' : style.text} />
                <Text style={[styles.chipText, { color: selected ? '#fff' : style.text }]}>{c}</Text>
              </TouchableOpacity>
            );
          })}
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
          maxLength={MAX_LENGTH}
        />
        <Text style={styles.charCount}>
          {content.length}/{MAX_LENGTH}
        </Text>

        <PrimaryButton title="Post" icon="paper-plane-outline" onPress={handlePost} loading={posting} />
      </FadeInView>
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
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeSpacer: {
    width: 36,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.textDark,
  },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
  chipText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
  },
  textArea: {
    backgroundColor: colors.cardBg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textDark,
    minHeight: 140,
  },
  charCount: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    textAlign: 'right',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
});
