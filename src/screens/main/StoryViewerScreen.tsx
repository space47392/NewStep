import { useEffect, useRef, useState } from 'react';
import { View, Text, Image, TouchableOpacity, Animated, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { deleteStory } from '../../lib/stories';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import ReportSheet from '../../components/ReportSheet';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';
import { MainStackParamList, ReportTargetType } from '../../types';

const STORY_DURATION_MS = 5000;

export default function StoryViewerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'StoryViewer'>>();
  const { stories, initialIndex } = route.params;
  const { user } = useAuth();

  const [index, setIndex] = useState(initialIndex);
  const [deleting, setDeleting] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: ReportTargetType; id: string } | null>(null);
  const progress = useRef(new Animated.Value(0)).current;

  const story = stories[index];
  const isOwnStory = user?.id === story.author_id;

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION_MS,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) goToNext();
    });
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

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

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Image source={{ uri: story.image_url }} style={styles.image} resizeMode="cover" />

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
        <Avatar uri={story.profiles?.avatar_url} size={36} />
        <View style={styles.headerText}>
          <Text style={styles.name}>{story.profiles?.full_name ?? 'Unknown'}</Text>
          <Text style={styles.time}>{formatRelativeTime(story.created_at)}</Text>
        </View>
        {isOwnStory ? (
          <TouchableOpacity style={styles.iconButton} onPress={handleDelete} disabled={deleting}>
            {deleting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="trash-outline" size={20} color="#fff" />
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

      <View style={styles.tapZones}>
        <TouchableOpacity style={styles.tapZoneLeft} activeOpacity={1} onPress={goToPrevious} />
        <TouchableOpacity style={styles.tapZoneRight} activeOpacity={1} onPress={goToNext} />
      </View>

      <ReportSheet target={reportTarget} reporterId={user?.id} onClose={() => setReportTarget(null)} />
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
  headerText: {
    flex: 1,
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
});
