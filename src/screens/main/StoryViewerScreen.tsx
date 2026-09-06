import { useEffect, useRef, useState } from 'react';
import { View, Text, Image, TouchableOpacity, Animated, ActivityIndicator, Alert, BackHandler, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { deleteStory, recordStoryView, fetchStoryViewers, sayHiToStory } from '../../lib/stories';
import { markStorySeen } from '../../lib/storyPrefs';
import { getOrCreateConversation } from '../../lib/chat';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import ActionSheet, { ActionSheetAction } from '../../components/ActionSheet';
import ReportSheet from '../../components/ReportSheet';
import StoryViewsModal from '../../components/StoryViewsModal';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';
import { MainStackParamList, ReportTargetType } from '../../types';

const STORY_DURATION_MS = 5000;

export default function StoryViewerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'StoryViewer'>>();
  const { stories, initialIndex } = route.params;
  const { user } = useAuth();
  const { showToast } = useToast();

  const [index, setIndex] = useState(initialIndex);
  const [deleting, setDeleting] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [waving, setWaving] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: ReportTargetType; id: string } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [viewsModalVisible, setViewsModalVisible] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  // Only set while an onLongPress has actually fired — a plain tap's onPressOut
  // shouldn't try to "resume" an animation that was never paused.
  const isPausedRef = useRef(false);
  const pausedValueRef = useRef(0);

  const story = stories[index];
  const isOwnStory = user?.id === story.author_id;

  const goToNext = () => {
    if (index < stories.length - 1) {
      setIndex((i) => i + 1);
    } else {
      navigation.goBack();
    }
  };

  const goToPrevious = () => {
    if (index > 0) setIndex((i) => i - 1);
  };

  // Android hardware back should exit to Feed exactly like the close button —
  // returning true suppresses the default handling so this is the only thing
  // that runs (no double pop).
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [navigation]);

  const startProgress = (fromValue: number) => {
    progress.setValue(fromValue);
    const remainingMs = Math.max(STORY_DURATION_MS * (1 - fromValue), 0);
    Animated.timing(progress, {
      toValue: 1,
      duration: remainingMs,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) goToNext();
    });
  };

  // A new story: reset everything, mark it seen right away (opening it is
  // enough), and — for someone else's story — record a view. Never counts a
  // story owner viewing their own story.
  useEffect(() => {
    setImageLoaded(false);
    isPausedRef.current = false;
    progress.setValue(0);
    if (user) {
      markStorySeen(user.id, story.id).catch(() => {});
      if (story.author_id !== user.id) {
        recordStoryView({ storyId: story.id, viewerId: user.id }).catch(() => {});
      }
    }
    return () => {
      progress.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Don't start the auto-advance timer until the image has actually finished
  // loading — otherwise a slow connection can advance past a story before its
  // photo was ever visible.
  useEffect(() => {
    if (!imageLoaded) return;
    startProgress(0);
    return () => {
      progress.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageLoaded]);

  // Own-story view count, for the "👁 N views" row — fetched fresh per story
  // since it's cheap and keeps the count accurate as new views come in.
  useEffect(() => {
    if (!isOwnStory) {
      setViewCount(0);
      return;
    }
    let isMounted = true;
    fetchStoryViewers(story.id)
      .then((viewers) => {
        if (isMounted) setViewCount(viewers.length);
      })
      .catch(() => {
        if (isMounted) setViewCount(0);
      });
    return () => {
      isMounted = false;
    };
  }, [story.id, isOwnStory]);

  const handleHoldStart = () => {
    progress.stopAnimation((value) => {
      pausedValueRef.current = value;
    });
    isPausedRef.current = true;
  };

  const handleHoldEnd = () => {
    if (!isPausedRef.current) return;
    isPausedRef.current = false;
    startProgress(pausedValueRef.current);
  };

  const handleDelete = () => {
    Alert.alert('Delete story?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteStory(story.id);
            navigation.goBack();
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Could not delete story.';
            Alert.alert('Error', message);
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const menuActions: ActionSheetAction[] = [
    { label: 'Delete Story', icon: 'trash-outline', destructive: true, onPress: handleDelete },
  ];

  // Opens a conversation for Reply — never sends anything on its own, the
  // user still has to review the composer and tap Send.
  const openConversationWithAuthor = async (prefillText?: string) => {
    if (!user || messaging) return;
    setMessaging(true);
    try {
      const conversationId = await getOrCreateConversation(story.author_id);
      navigation.navigate('Conversation', {
        conversationId,
        otherUser: {
          id: story.author_id,
          full_name: story.profiles?.full_name ?? null,
          avatar_url: story.profiles?.avatar_url ?? null,
        },
        prefillText,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start a conversation.';
      Alert.alert('Error', message);
    } finally {
      setMessaging(false);
    }
  };

  const handleReply = () => openConversationWithAuthor();

  // No conversation is created here — send_story_wave() only fires one
  // lightweight notification through the existing guard-flag-protected
  // create_notification() (see story_wave_schema.sql). Nothing to review or
  // send afterward — this action is complete as soon as it succeeds.
  const handleSayHi = async () => {
    if (!user || waving) return;
    setWaving(true);
    try {
      await sayHiToStory(story.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Hi sent! 👋');
    } catch (err) {
      // Transient/retryable, not destructive — a toast is enough (Step 30).
      const message = err instanceof Error ? err.message : 'Could not send that.';
      showToast(message);
    } finally {
      setWaving(false);
    }
  };

  // Opens a fresh Need Help post draft rather than messaging the author
  // directly — this turns what the viewer noticed in the story into a real,
  // trackable Help request the whole school community can volunteer on
  // (existing volunteer_to_help() flow), not a DM and not the viewer
  // personally committing to help right here. Stories carry no caption/text
  // (image-only), so this can't quote the story like a post's content — the
  // stub below is deliberately incomplete, forcing an actual edit rather than
  // a blind tap-to-post. Only story.id is persisted (posts.source_story_id);
  // the author's name here is compose-screen-only context, never stored.
  const handleICanHelp = () => {
    navigation.navigate('CreatePost', {
      prefillCategory: 'Need Help',
      prefillContent: 'About this School Story: ',
      sourceStoryId: story.id,
      sourceStoryAuthorName: story.profiles?.full_name ?? null,
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Image
        source={{ uri: story.image_url }}
        style={styles.image}
        resizeMode="cover"
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageLoaded(true)}
      />

      {!imageLoaded && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color="#fff" />
        </View>
      )}

      {/* Rendered first (i.e. underneath) so the header/action controls below,
          which render after and therefore paint on top, actually receive their
          own taps instead of this full-screen overlay swallowing them. */}
      <View style={styles.tapZones}>
        <TouchableOpacity
          style={styles.tapZoneLeft}
          activeOpacity={1}
          delayLongPress={180}
          onPress={goToPrevious}
          onLongPress={handleHoldStart}
          onPressOut={handleHoldEnd}
        />
        <TouchableOpacity
          style={styles.tapZoneRight}
          activeOpacity={1}
          delayLongPress={180}
          onPress={goToNext}
          onLongPress={handleHoldStart}
          onPressOut={handleHoldEnd}
        />
      </View>

      <View style={styles.progressRow}>
        {stories.map((s, i) => (
          <View key={s.id} style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width:
                    i < index
                      ? '100%'
                      : i === index
                        ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                        : '0%',
                },
              ]}
            />
          </View>
        ))}
      </View>

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerUser}
          onPress={() => navigation.navigate('UserProfile', { userId: story.author_id })}
        >
          <Avatar uri={story.profiles?.avatar_url} size={36} />
          <View style={styles.headerText}>
            <Text style={styles.name}>{story.profiles?.full_name ?? 'Unknown'}</Text>
            <Text style={styles.time} numberOfLines={1}>
              {formatRelativeTime(story.created_at)}
              {story.profiles?.school_name ? ` · ${story.profiles.school_name}` : ''}
            </Text>
          </View>
        </TouchableOpacity>
        {isOwnStory ? (
          <TouchableOpacity style={styles.iconButton} onPress={() => setMenuVisible(true)} disabled={deleting}>
            {deleting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setReportTarget({ type: 'story', id: story.id })}
          >
            <Ionicons name="flag-outline" size={20} color="#fff" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {isOwnStory ? (
        <TouchableOpacity style={styles.viewsRow} onPress={() => setViewsModalVisible(true)}>
          <Ionicons name="eye-outline" size={16} color="#fff" />
          <Text style={styles.viewsText}>
            {viewCount} {viewCount === 1 ? 'view' : 'views'}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionPill} onPress={handleSayHi} disabled={waving}>
            {waving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.actionPillText}>👋 Say Hi</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionPill} onPress={handleICanHelp} disabled={messaging}>
            <Text style={styles.actionPillText}>🤝 I Can Help</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionPill} onPress={handleReply} disabled={messaging}>
            <Text style={styles.actionPillText}>💬 Reply</Text>
          </TouchableOpacity>
        </View>
      )}

      <ActionSheet visible={menuVisible} onClose={() => setMenuVisible(false)} actions={menuActions} />
      <ReportSheet target={reportTarget} reporterId={user?.id} onClose={() => setReportTarget(null)} />
      <StoryViewsModal
        storyId={story.id}
        visible={viewsModalVisible}
        onClose={() => setViewsModalVisible(false)}
        onSelectUser={(userId) => {
          setViewsModalVisible(false);
          navigation.navigate('UserProfile', { userId });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  image: {
    flex: 1,
    width: '100%',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressRow: {
    position: 'absolute',
    top: spacing.xl,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    gap: 4,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
  },
  header: {
    position: 'absolute',
    top: spacing.xl + spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerUser: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: '#fff',
  },
  time: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.85)',
  },
  iconButton: {
    padding: spacing.xs,
  },
  tapZones: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  tapZoneLeft: {
    flex: 1,
  },
  tapZoneRight: {
    flex: 1,
  },
  viewsRow: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  viewsText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: '#fff',
  },
  actionsRow: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.xl,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
  },
  actionPillText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: '#fff',
  },
});
