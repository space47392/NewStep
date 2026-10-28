import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { WISH_MAX } from '../../lib/sky';
import PrimaryButton from '../PrimaryButton';
import { colors, spacing, fontSize, fontFamily, dark } from '../../constants/theme';

type Props = {
  saving: boolean;
  onClose: () => void;
  onSubmit: (wish: string) => void;
};

// After catching a shooting star: one short, nameless wish for the school's
// sky. Mounted only while open, so it always starts blank.
export default function WishSheet({ saving, onClose, onSubmit }: Props) {
  const [text, setText] = useState('');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.wishBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.wishSheet}>
          <Text style={styles.wishEmoji}>🌠</Text>
          <Text style={styles.sheetTitle}>You caught a shooting star!</Text>
          <Text style={styles.wishSub}>Make a wish. It floats in your school's sky for a day — nobody sees who made it.</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="I wish…"
            placeholderTextColor={colors.warm.creamFaint}
            value={text}
            onChangeText={setText}
            maxLength={WISH_MAX}
            autoFocus
          />
          <Text style={styles.noteCount}>
            {text.length}/{WISH_MAX}
          </Text>
          <PrimaryButton variant="warm" title="Send it to the sky" icon="sparkles" loading={saving} disabled={!text.trim()} onPress={() => onSubmit(text)} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wishBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(10,9,26,0.7)',
  },
  wishSheet: {
    backgroundColor: '#1E1928',
    borderRadius: 26,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,196,120,0.3)',
  },
  wishEmoji: {
    fontSize: 40,
    textAlign: 'center',
  },
  wishSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: dark.textMid,
  },
  sheetTitle: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.xl,
    color: colors.warm.cream,
    textAlign: 'center',
  },
  noteInput: {
    backgroundColor: colors.warm.glassSoft,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.warm.cream,
  },
  noteCount: {
    alignSelf: 'flex-end',
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.warm.creamFaint,
    marginTop: -spacing.xs,
  },
});
