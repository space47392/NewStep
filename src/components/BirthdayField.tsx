import { useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clampDay, daysInMonth, formatBirthday, MONTHS, type Birthday } from '../lib/age';
import { colors, spacing, radius, fontSize, fontFamily, light } from '../constants/theme';

// Birthday for the sign-up age check: month, day and year. Deliberately
// neutral: every year is listed (not just old-enough ones) and nothing hints
// at the answer. The value never leaves the device (see lib/age.ts).

export type { Birthday };

type Props = { value: Birthday | null; onChange: (b: Birthday) => void };

// Any leap year, so Feb 29 can be picked before a year is.
const LEAP_YEAR = 2024;

export default function BirthdayField({ value, onChange }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => thisYear - i);
  const [month, setMonth] = useState<number | null>(value?.month ?? null);
  const [day, setDay] = useState<number | null>(value?.day ?? null);
  const [year, setYear] = useState<number | null>(value?.year ?? null);

  // Days in the chosen month (all 31 until a month is picked).
  const dayCount = month === null ? 31 : daysInMonth(year ?? LEAP_YEAR, month);
  const days = Array.from({ length: dayCount }, (_, i) => i + 1);

  const pickMonth = (m: number) => {
    setMonth(m);
    if (day !== null) setDay(clampDay(year ?? LEAP_YEAR, m, day));
  };
  const pickYear = (y: number) => {
    setYear(y);
    if (day !== null && month !== null) setDay(clampDay(y, month, day));
  };

  const ready = month !== null && day !== null && year !== null;
  const done = () => {
    if (!ready) return;
    onChange({ year: year!, month: month!, day: day! });
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={() => setOpen(true)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Birthday">
        <Ionicons name="gift-outline" size={18} color={light.textLight} style={styles.icon} />
        <Text style={[styles.fieldText, !value && styles.placeholder]}>{value ? formatBirthday(value) : 'Month, day and year'}</Text>
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
                style={[styles.column, styles.monthColumn]}
                data={MONTHS}
                keyExtractor={(m) => m}
                renderItem={({ item, index }) => (
                  <TouchableOpacity style={[styles.option, month === index && styles.optionOn]} onPress={() => pickMonth(index)} accessibilityState={{ selected: month === index }}>
                    <Text style={[styles.optionText, month === index && styles.optionTextOn]}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
              <FlatList
                style={styles.column}
                data={days}
                keyExtractor={(d) => String(d)}
                renderItem={({ item }) => (
                  <TouchableOpacity style={[styles.option, day === item && styles.optionOn]} onPress={() => setDay(item)} accessibilityState={{ selected: day === item }}>
                    <Text style={[styles.optionText, styles.center, day === item && styles.optionTextOn]}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
              <FlatList
                style={styles.column}
                data={years}
                keyExtractor={(y) => String(y)}
                renderItem={({ item }) => (
                  <TouchableOpacity style={[styles.option, year === item && styles.optionOn]} onPress={() => pickYear(item)} accessibilityState={{ selected: year === item }}>
                    <Text style={[styles.optionText, styles.center, year === item && styles.optionTextOn]}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
            <TouchableOpacity style={[styles.done, !ready && styles.doneOff]} onPress={done} disabled={!ready}>
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
  monthColumn: {
    flex: 1.6,
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
  center: {
    textAlign: 'center',
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
