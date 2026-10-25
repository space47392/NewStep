import { useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius, fontSize, fontFamily, light } from '../constants/theme';

// Birth month + year for the sign-up age check. Deliberately neutral: every
// year is listed (not just old-enough ones) and nothing hints at the answer.
// The value never leaves the device — only "old enough or not" is used.

export type Birthday = { month: number; year: number }; // month 0–11

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Whole months lived, counting the birth month as not yet complete — so
// someone whose 13th birthday is later this month waits until next month.
export function isAtLeast(b: Birthday, years: number, now = new Date()): boolean {
  const months = (now.getFullYear() - b.year) * 12 + (now.getMonth() - b.month);
  return months > years * 12;
}

type Props = { value: Birthday | null; onChange: (b: Birthday) => void };

export default function BirthdayField({ value, onChange }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => thisYear - i);
  const [month, setMonth] = useState<number | null>(value?.month ?? null);
  const [year, setYear] = useState<number | null>(value?.year ?? null);

  const done = () => {
    if (month === null || year === null) return;
    onChange({ month, year });
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={() => setOpen(true)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Birthday">
        <Ionicons name="gift-outline" size={18} color={light.textLight} style={styles.icon} />
        <Text style={[styles.fieldText, !value && styles.placeholder]}>{value ? `${MONTHS[value.month]} ${value.year}` : 'Month and year'}</Text>
        <Ionicons name="chevron-down" size={16} color={light.textLight} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={styles.backdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.handle} />
            <Text style={styles.title}>When's your birthday?</Text>
            <View style={styles.columns}>
              <FlatList
                style={styles.column}
                data={MONTHS}
                keyExtractor={(m) => m}
                renderItem={({ item, index }) => (
                  <TouchableOpacity style={[styles.option, month === index && styles.optionOn]} onPress={() => setMonth(index)}>
                    <Text style={[styles.optionText, month === index && styles.optionTextOn]}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
              <FlatList
                style={styles.column}
                data={years}
                keyExtractor={(y) => String(y)}
                renderItem={({ item }) => (
                  <TouchableOpacity style={[styles.option, year === item && styles.optionOn]} onPress={() => setYear(item)}>
                    <Text style={[styles.optionText, year === item && styles.optionTextOn]}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
            <TouchableOpacity style={[styles.done, (month === null || year === null) && styles.doneOff]} onPress={done} disabled={month === null || year === null}>
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: light.surface,
    borderWidth: 1,
    borderColor: light.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 15,
  },
  icon: {
    marginRight: spacing.sm,
  },
  fieldText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: light.text,
  },
  placeholder: {
    color: light.textLight,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,14,8,0.4)',
  },
  sheet: {
    backgroundColor: light.background,
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
    backgroundColor: light.border,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: light.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  columns: {
    flexDirection: 'row',
    gap: spacing.sm,
    height: 280,
  },
  column: {
    flex: 1,
    backgroundColor: light.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: light.hairline,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  optionOn: {
    backgroundColor: light.tint,
  },
  optionText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: light.textMid,
  },
  optionTextOn: {
    fontFamily: fontFamily.semibold,
    color: light.link,
  },
  done: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneOff: {
    opacity: 0.45,
  },
  doneText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.onPrimary,
  },
});
