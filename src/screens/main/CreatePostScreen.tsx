import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { createPost, editPost } from '../../lib/posts';
import { uploadPostPhoto } from '../../lib/postPhotos';
import PrimaryButton from '../../components/PrimaryButton';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';
import { CATEGORY_STYLES } from '../../constants/categoryStyles';
import { MainStackParamList, PostCategory } from '../../types';

const CATEGORIES: PostCategory[] = ['Need Help', 'School Question', 'Looking for Friends'];
const MAX_LENGTH = 500;
const MAX_PHOTOS = 5;

export default function CreatePostScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'CreatePost'>>();
  const editingPost = route.params?.post;
  const { user } = useAuth();
  const { showToast } = useToast();

  // Never auto-posted — just starts the draft already typed (e.g. StoryViewer's
  // "I Can Help"); the user still has to review, edit, and tap Post themselves.
  const [content, setContent] = useState(editingPost?.content ?? route.params?.prefillContent ?? '');
  const [category, setCategory] = useState<PostCategory>(
    editingPost?.category ?? route.params?.prefillCategory ?? 'Looking for Friends'
  );
  // School Story context (StoryViewer's "I Can Help") — only ever set when
  // actually creating a new post, never carried into an edit.
  const sourceStoryId = editingPost ? undefined : route.params?.sourceStoryId;
  const sourceStoryAuthorName = route.params?.sourceStoryAuthorName;
  const [existingPhotoUrls, setExistingPhotoUrls] = useState<string[]>(editingPost?.photo_urls ?? []);
  const [newPhotos, setNewPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [posting, setPosting] = useState(false);

  const totalPhotos = existingPhotoUrls.length + newPhotos.length;
  const remainingSlots = MAX_PHOTOS - totalPhotos;

  const handlePickPhotos = async () => {
    if (remainingSlots <= 0) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow photo library access to add photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remainingSlots,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;

    setNewPhotos((prev) => [...prev, ...result.assets]);
  };

  const handleRemoveExisting = (url: string) => {
    setExistingPhotoUrls((prev) => prev.filter((u) => u !== url));
  };

  const handleRemoveNew = (index: number) => {
    setNewPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!content.trim()) {
      Alert.alert('Empty post', 'Write something before posting.');
      return;
    }
    if (!user) return;

    setPosting(true);
    try {
      if (editingPost) {
        const uploadedUrls = await Promise.all(
          newPhotos.map((asset) =>
            uploadPostPhoto({
              userId: user.id,
              postId: editingPost.id,
              localUri: asset.uri,
              mimeType: asset.mimeType,
            })
          )
        );
        const removedPhotoUrls = editingPost.photo_urls.filter((url) => !existingPhotoUrls.includes(url));

        await editPost({
          postId: editingPost.id,
          content: content.trim(),
          category,
          photoUrls: [...existingPhotoUrls, ...uploadedUrls],
          removedPhotoUrls,
        });
        showToast('Post updated');
      } else {
        const postId = Crypto.randomUUID();
        const uploadedUrls = await Promise.all(
          newPhotos.map((asset) =>
            uploadPostPhoto({ userId: user.id, postId, localUri: asset.uri, mimeType: asset.mimeType })
          )
        );

        await createPost({
          postId,
          authorId: user.id,
          content: content.trim(),
          category,
          photoUrls: uploadedUrls,
          sourceStoryId,
        });
      }
      navigation.goBack();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      Alert.alert(editingPost ? 'Could not save changes' : 'Could not post', message);
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
        <Text style={styles.title}>{editingPost ? 'Edit Post' : 'New Post'}</Text>
        <View style={styles.closeSpacer} />
      </View>

      <FadeInView>
        {sourceStoryId && (
          <View style={styles.storyContextBanner}>
            <Ionicons name="albums-outline" size={16} color={colors.primary} />
            <Text style={styles.storyContextText}>
              You're responding to {sourceStoryAuthorName ? `${sourceStoryAuthorName}'s` : 'a'} School Story
            </Text>
          </View>
        )}

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

        <Text style={styles.label}>
          Photos {totalPhotos > 0 ? `(${totalPhotos}/${MAX_PHOTOS})` : '(optional)'}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
          {existingPhotoUrls.map((url) => (
            <View key={url} style={styles.photoThumbWrap}>
              <Image source={{ uri: url }} style={styles.photoThumb} />
              <TouchableOpacity style={styles.photoRemove} onPress={() => handleRemoveExisting(url)}>
                <Ionicons name="close" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          {newPhotos.map((asset, index) => (
            <View key={asset.assetId ?? asset.uri} style={styles.photoThumbWrap}>
              <Image source={{ uri: asset.uri }} style={styles.photoThumb} />
              <TouchableOpacity style={styles.photoRemove} onPress={() => handleRemoveNew(index)}>
                <Ionicons name="close" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          {remainingSlots > 0 && (
            <TouchableOpacity style={styles.addPhotoTile} onPress={handlePickPhotos}>
              <Ionicons name="image-outline" size={24} color={colors.primary} />
              <Text style={styles.addPhotoText}>Add</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <PrimaryButton
          title={editingPost ? 'Save Changes' : 'Post'}
          icon={editingPost ? 'checkmark-outline' : 'paper-plane-outline'}
          onPress={handleSubmit}
          loading={posting}
          style={styles.submitButton}
        />
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
  storyContextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  storyContextText: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primary,
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
  photoRow: {
    marginBottom: spacing.lg,
  },
  photoThumbWrap: {
    position: 'relative',
    marginRight: spacing.sm,
  },
  photoThumb: {
    width: 76,
    height: 76,
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
  },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: radius.full,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addPhotoTile: {
    width: 76,
    height: 76,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addPhotoText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.primary,
    marginTop: 2,
  },
  submitButton: {
    marginTop: spacing.sm,
  },
});
