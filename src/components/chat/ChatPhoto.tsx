import { ActivityIndicator, Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useChatPhotoUrl } from '../../lib/chatPhotos';
import { colors } from '../../constants/theme';

type Props = {
  // Storage path in the private chat-photos bucket; turned into a signed URL.
  path?: string | null;
  // The local file while it's still uploading, shown instead.
  localUri?: string;
  onOpen: (url: string) => void;
  onLongPress?: () => void;
};

export default function ChatPhoto({ path, localUri, onOpen, onLongPress }: Props) {
  const signed = useChatPhotoUrl(localUri ? null : path);
  const uri = localUri ?? signed;
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      disabled={!uri || !!localUri}
      onPress={() => uri && onOpen(uri)}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="imagebutton"
      accessibilityLabel="Open photo"
    >
      {uri ? (
        <Image source={{ uri }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.loading]}>
          <ActivityIndicator color={colors.textLight} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  photo: {
    width: 220,
    height: 260,
    borderRadius: 16,
    backgroundColor: colors.hairline,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
