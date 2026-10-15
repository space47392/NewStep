import { useCallback, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, fontFamily } from '../constants/theme';

// A warm bottom sheet for questions and choices, in place of the white system
// Alert on the calm screens (Lanterns, School Sky).
//
//   const { ask, sheet } = useWarmSheet();
//   ask({ title: 'Let this lantern go?', actions: [{ label: 'Let it go', danger: true, onPress }] });
//   ...render {sheet} once in the screen.

export type WarmAction = {
  label: string;
  onPress: () => void | Promise<void>;
  danger?: boolean;
};

type Ask = {
  title: string;
  message?: string;
  emoji?: string;
  actions: WarmAction[];
  cancelLabel?: string;
};

export function useWarmSheet() {
  const [current, setCurrent] = useState<Ask | null>(null);
  const insets = useSafeAreaInsets();
  const close = useCallback(() => setCurrent(null), []);
  const ask = useCallback((a: Ask) => setCurrent(a), []);

  const sheet = (
    <Modal visible={!!current} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} accessibilityLabel="Close" />
        {current ? (
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.handle} />
            {current.emoji ? <Text style={styles.emoji}>{current.emoji}</Text> : null}
            <Text style={styles.title}>{current.title}</Text>
            {current.message ? <Text style={styles.message}>{current.message}</Text> : null}
            <View style={styles.actions}>
              {current.actions.map((a) => (
                <TouchableOpacity
                  key={a.label}
                  style={[styles.action, a.danger ? styles.actionDanger : styles.actionWarm]}
                  activeOpacity={0.85}
                  onPress={() => {
                    close();
                    a.onPress();
                  }}
                  accessibilityRole="button"
                >
                  <Text style={[styles.actionText, a.danger ? styles.actionTextDanger : styles.actionTextWarm]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.cancel} onPress={close} accessibilityRole="button">
                <Text style={styles.cancelText}>{current.cancelLabel ?? 'Never mind'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );

  return { ask, sheet };
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,12,18,0.55)',
  },
  sheet: {
    backgroundColor: '#2A1D2B',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: colors.warm.line,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.warm.line,
    marginBottom: spacing.sm,
  },
  emoji: {
    fontSize: 30,
    textAlign: 'center',
  },
  title: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.lg,
    color: colors.warm.cream,
    textAlign: 'center',
  },
  message: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.warm.creamMuted,
    textAlign: 'center',
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  action: {
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionWarm: {
    backgroundColor: colors.warm.honey,
  },
  actionDanger: {
    backgroundColor: 'rgba(255,140,120,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,140,120,0.35)',
  },
  actionText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
  },
  actionTextWarm: {
    color: colors.warm.honeyInk,
  },
  actionTextDanger: {
    color: '#FFB4A6',
  },
  cancel: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.warm.creamMuted,
  },
});
