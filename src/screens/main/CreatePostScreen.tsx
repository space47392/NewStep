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
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { createPost, editPost } from '../../lib/posts';
import { uploadPostPhoto } from '../../lib/postPhotos';
import PrimaryButton from '../../components/PrimaryButton';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';
import { CATEGORY_STYLES } from '../../constants/categoryStyles';
import { MainStackParamList, PostCategory } from '../../types';

const CATEGORIES: PostCategory[] = ['Need Help', 'School Question', 'Looking for Friends', 'Event'];

// Friendly display only — never shown to the user as a raw ISO timestamp.
function formatFriendlyDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatFriendlyTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
// Merges a chosen date (day/month/year) with a chosen time (hour/minute) into
// one Date — the native pickers hand back separate Date objects for each,
// so this is how the two get combined into the single timestamp posts.ts stores.
function combineDateAndTime(date: Date, time: Date): Date {
  const combined = new Date(date);
  combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return combined;
}
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

  // Event-only fields — real Date values from the native picker, never typed
  // text. eventDate holds the day/month/year; eventStartTime/eventEndTime
  // hold the hour/minute; combineDateAndTime() merges them at submit time.
  const [eventDate, setEventDate] = useState<Date | null>(
    editingPost?.event_date ? new Date(editingPost.event_date) : null
  );
  const [eventStartTime, setEventStartTime] = useState<Date | null>(
    editingPost?.event_date ? new Date(editingPost.event_date) : null
  );
  const [eventEndTime, setEventEndTime] = useState<Date | null>(
    editingPost?.event_end_time ? new Date(editingPost.event_end_time) : null
  );
  // End time stays collapsed behind "Add end time" unless this post already had one.
  const [showEndTimeField, setShowEndTimeField] = useState(!!editingPost?.event_end_time);
  const [eventLocation, setEventLocation] = useState(editingPost?.event_location ?? '');
  // Which native picker (if any) is currently open — only one at a time.
  const [activePicker, setActivePicker] = useState<'date' | 'start' | 'end' | null>(null);

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

  const handleQuickDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    setEventDate(d);
  };

  // Shared onChange for all three pickers (date/start/end) — Android's native
  // dialog closes itself after a pick or a cancel, so it's dismissed here;
  // iOS's spinner stays open (no native dismiss event) until the user taps Done.
  const handlePickerChange = (onSelect: (d: Date) => void) => (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== 'ios') setActivePicker(null);
    if (event.type === 'dismissed' || !selected) return;
    onSelect(selected);
  };

  const handleSubmit = async () => {
    if (!content.trim()) {
      Alert.alert('Empty post', 'Write something before posting.');
      return;
    }
    if (!user) return;

    let eventDateIso: string | undefined;
    let eventEndTimeIso: string | undefined;
    if (category === 'Event') {
      if (!eventDate || !eventStartTime) {
        Alert.alert('Missing event details', 'Choose a date and a start time for this event.');
        return;
      }
      const startDateTime = combineDateAndTime(eventDate, eventStartTime);
      if (showEndTimeField && eventEndTime) {
        const endDateTime = combineDateAndTime(eventDate, eventEndTime);
        if (endDateTime.getTime() <= startDateTime.getTime()) {
          Alert.alert('Invalid event time', 'End time must be after the start time.');
          return;
        }
        eventEndTimeIso = endDateTime.toISOString();
      }
      eventDateIso = startDateTime.toISOString();
    }

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
          eventDate: eventDateIso,
          eventEndTime: eventEndTimeIso,
          eventLocation: category === 'Event' ? eventLocation.trim() || undefined : undefined,
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
          eventDate: eventDateIso,
          eventEndTime: eventEndTimeIso,
          eventLocation: category === 'Event' ? eventLocation.trim() || undefined : undefined,
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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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

        {category === 'Event' && (
          <View style={styles.eventFields}>
            <Text style={styles.eventDisclaimer}>
              Community events are posted by students — not officially organized or verified by the school.
            </Text>

            <Text style={styles.label}>Date</Text>
            <View style={styles.quickDateRow}>
              <TouchableOpacity style={styles.quickDateChip} onPress={() => handleQuickDate(0)}>
                <Text style={styles.quickDateChipText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickDateChip} onPress={() => handleQuickDate(1)}>
                <Text style={styles.quickDateChipText}>Tomorrow</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickDateChip} onPress={() => setActivePicker('date')}>
                <Text style={styles.quickDateChipText}>Pick a date</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.pickerField} onPress={() => setActivePicker('date')}>
              <Text style={eventDate ? styles.pickerFieldValue : styles.pickerFieldPlaceholder}>
                {eventDate ? `📅 ${formatFriendlyDate(eventDate)}` : 'Select a date'}
              </Text>
            </TouchableOpacity>
            {activePicker === 'date' && (
              <View style={styles.pickerWrap}>
                <DateTimePicker
                  value={eventDate ?? new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handlePickerChange(setEventDate)}
                />
                {Platform.OS === 'ios' && (
                  <TouchableOpacity style={styles.pickerDoneButton} onPress={() => setActivePicker(null)}>
                    <Text style={styles.pickerDoneText}>Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <Text style={styles.label}>Start Time</Text>
            <TouchableOpacity style={styles.pickerField} onPress={() => setActivePicker('start')}>
              <Text style={eventStartTime ? styles.pickerFieldValue : styles.pickerFieldPlaceholder}>
                {eventStartTime ? `🕐 ${formatFriendlyTime(eventStartTime)}` : 'Select a start time'}
              </Text>
            </TouchableOpacity>
            {activePicker === 'start' && (
              <View style={styles.pickerWrap}>
                <DateTimePicker
                  value={eventStartTime ?? new Date()}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handlePickerChange(setEventStartTime)}
                />
                {Platform.OS === 'ios' && (
                  <TouchableOpacity style={styles.pickerDoneButton} onPress={() => setActivePicker(null)}>
                    <Text style={styles.pickerDoneText}>Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {showEndTimeField ? (
              <>
                <View style={styles.endTimeHeaderRow}>
                  <Text style={styles.label}>End Time (optional)</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowEndTimeField(false);
                      setEventEndTime(null);
                      if (activePicker === 'end') setActivePicker(null);
                    }}
                  >
                    <Text style={styles.removeEndTimeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.pickerField} onPress={() => setActivePicker('end')}>
                  <Text style={eventEndTime ? styles.pickerFieldValue : styles.pickerFieldPlaceholder}>
                    {eventEndTime ? `🕐 ${formatFriendlyTime(eventEndTime)}` : 'Select an end time'}
                  </Text>
                </TouchableOpacity>
                {activePicker === 'end' && (
                  <View style={styles.pickerWrap}>
                    <DateTimePicker
                      value={eventEndTime ?? eventStartTime ?? new Date()}
                      mode="time"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={handlePickerChange(setEventEndTime)}
                    />
                    {Platform.OS === 'ios' && (
                      <TouchableOpacity style={styles.pickerDoneButton} onPress={() => setActivePicker(null)}>
                        <Text style={styles.pickerDoneText}>Done</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </>
            ) : (
              <TouchableOpacity
                style={styles.addEndTimeButton}
                onPress={() => {
                  setShowEndTimeField(true);
                  setActivePicker('end');
                }}
              >
                <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                <Text style={styles.addEndTimeText}>Add end time</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.label}>Location (optional)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Gym, Room 204"
              placeholderTextColor={colors.textLight}
              value={eventLocation}
              onChangeText={setEventLocation}
            />
          </View>
        )}

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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
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
  eventFields: {
    marginBottom: spacing.lg,
  },
  eventDisclaimer: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginBottom: spacing.md,
  },
  textInput: {
    backgroundColor: colors.cardBg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textDark,
    marginBottom: spacing.md,
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  quickDateChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  quickDateChipText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  pickerField: {
    backgroundColor: colors.cardBg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  pickerFieldValue: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  pickerFieldPlaceholder: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textLight,
  },
  pickerWrap: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  pickerDoneButton: {
    alignSelf: 'stretch',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  pickerDoneText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  endTimeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  removeEndTimeText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.error,
    marginBottom: spacing.xs,
  },
  addEndTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  addEndTimeText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
});
