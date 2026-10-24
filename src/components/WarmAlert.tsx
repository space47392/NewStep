import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';

// A drop-in for React Native's Alert.alert that looks like the rest of
// NewStep: a soft bottom sheet instead of the white system dialog.
//
//   warmAlert('Delete message?', 'This cannot be undone.', [
//     { text: 'Cancel', style: 'cancel' },
//     { text: 'Delete', style: 'destructive', onPress: () => ... },
//   ]);
//
// <WarmAlertHost /> is mounted once in App.tsx.

export type WarmAlertButton = {
  text?: string;
  onPress?: () => void | Promise<void>;
  style?: 'default' | 'cancel' | 'destructive';
};

type Request = { title: string; message?: string; buttons: WarmAlertButton[] };

let show: ((r: Request) => void) | null = null;
const queue: Request[] = [];

export function warmAlert(title: string, message?: string, buttons?: WarmAlertButton[], _options?: unknown) {
  const req: Request = { title, message, buttons: buttons && buttons.length ? buttons : [{ text: 'OK' }] };
  if (show) show(req);
  else queue.push(req);
}

export function WarmAlertHost() {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<Request | null>(null);

  useEffect(() => {
    show = (r) => setCurrent(r);
    const pending = queue.shift();
    if (pending) setCurrent(pending);
    return () => {
      show = null;
    };
  }, []);

  if (!current) return null;
  const cancel = current.buttons.find((b) => b.style === 'cancel');
  const actions = current.buttons.filter((b) => b.style !== 'cancel');

  const press = (b?: WarmAlertButton) => {
    setCurrent(null);
    // Let the sheet close before the action (which may open another one).
    setTimeout(() => {
      b?.onPress?.();
      const next = queue.shift();
      if (next) setCurrent(next);
    }, 120);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => press(cancel)} statusBarTranslucent>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => (cancel || actions.length <= 1 ? press(cancel ?? actions[0]) : null)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{current.title}</Text>
          {current.message ? <Text style={styles.message}>{current.message}</Text> : null}
          <View style={styles.actions}>
            {actions.map((b, i) => (
              <TouchableOpacity
                key={`${b.text}-${i}`}
                style={[styles.action, b.style === 'destructive' ? styles.actionDanger : i === 0 ? styles.actionMain : styles.actionPlain]}
                activeOpacity={0.85}
                onPress={() => press(b)}
                accessibilityRole="button"
              >
                <Text style={[styles.actionText, b.style === 'destructive' ? styles.textDanger : i === 0 ? styles.textMain : styles.textPlain]}>
                  {b.text ?? 'OK'}
                </Text>
              </TouchableOpacity>
            ))}
            {cancel ? (
              <TouchableOpacity style={styles.cancel} onPress={() => press(cancel)} accessibilityRole="button">
                <Text style={styles.cancelText}>{cancel.text ?? 'Cancel'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,14,8,0.4)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.textDark,
    textAlign: 'center',
  },
  message: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.textMid,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  action: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionMain: {
    backgroundColor: colors.primary,
  },
  actionPlain: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  actionDanger: {
    backgroundColor: colors.errorLight,
  },
  actionText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
  },
  textMain: {
    color: colors.onPrimary,
  },
  textPlain: {
    color: colors.textDark,
  },
  textDanger: {
    color: colors.error,
  },
  cancel: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.textLight,
  },
});
