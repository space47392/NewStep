import { useEffect, useState } from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';

type Props = {
  uri?: string | null;
  size?: number;
};

export default function Avatar({ uri, size = 40 }: Props) {
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };
  // Falls back to the same placeholder used for "no uri" if the image
  // request itself fails (deleted/moved storage file, network hiccup, a
  // stale URL) — without this a broken avatar just rendered as a blank
  // circle forever. Resets whenever `uri` changes so a recycled list row's
  // next avatar gets its own fresh attempt rather than staying stuck on a
  // previous row's failure (Step 42).
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (uri && !failed) {
    return <Image source={{ uri }} style={[styles.image, dimensionStyle]} onError={() => setFailed(true)} />;
  }

  return (
    <View style={[styles.placeholder, dimensionStyle]}>
      <Ionicons name="person" size={size * 0.55} color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.primaryLight,
  },
  placeholder: {
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
