import { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, FlatList, TouchableOpacity, ActivityIndicator, Animated, StyleSheet } from 'react-native';
import Avatar from './Avatar';
import EmptyState from './EmptyState';
import { fetchPostLikers } from '../lib/likes';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../constants/theme';
import { ChatProfile } from '../types';

type Props = {
  postId: string;
  visible: boolean;
  onClose: () => void;
  onSelectUser: (userId: string) => void;
};

const SHEET_OFFSET = 400;

export default function LikesListModal({ postId, visible, onClose, onSelectUser }: Props) {
  const [modalVisible, setModalVisible] = useState(visible);
  const [likers, setLikers] = useState<ChatProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const translateY = useRef(new Animated.Value(SHEET_OFFSET)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setModalVisible(true);
      setLoading(true);
      fetchPostLikers(postId)
        .then(setLikers)
        .catch(() => setLikers([]))
        .finally(() => setLoading(false));

      translateY.setValue(SHEET_OFFSET);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 180, mass: 0.9 }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else if (modalVisible) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: SHEET_OFFSET, duration: 200, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setModalVisible(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, postId]);

  return (
    <Modal visible={modalVisible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <TouchableOpacity style={styles.backdropTouchable} activeOpacity={1} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <Text style={styles.title}>Likes</Text>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={likers}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={<EmptyState icon="heart-outline" title="No likes yet" />}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.row} onPress={() => onSelectUser(item.id)}>
                  <Avatar uri={item.avatar_url} size={40} />
                  <Text style={styles.name}>{item.full_name ?? 'Unknown'}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  backdropTouchable: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.cardBg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '70%',
    ...shadow.floating,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.textDark,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  loadingWrap: {
    paddingVertical: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
});
