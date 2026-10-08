import { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSkyDiary, skyMood, SkyDiaryDay, SKY_MOODS, SkyMood } from '../../lib/sky';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';
import { MainStackParamList } from '../../types';

// Sky Diary: every day you put up a star becomes a page — that day's mood,
// line and the colours of the sky you photographed. Laid out as a month of
// little skies, so how your days at a new school have felt shows at a glance.

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function DayCell({ entry, day, isToday, selected, size, onPress }: { entry?: SkyDiaryDay; day: number; isToday: boolean; selected: boolean; size: number; onPress: () => void }) {
  const mood = entry ? skyMood(entry.mood) : null;
  const palette = entry?.sky_colors ?? (mood ? [mood.color, mood.color, colors.night] : null);
  return (
    <TouchableOpacity
      style={[styles.cell, { width: size }, selected && styles.cellSelected, isToday && !selected && styles.cellToday]}
      onPress={onPress}
      disabled={!entry}
      activeOpacity={0.8}
      accessibilityLabel={entry ? `Day ${day}: ${mood!.label}` : `Day ${day}`}
    >
      {palette ? (
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 10 10" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={`d${day}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={palette[0]} stopOpacity={entry?.sky_colors ? 1 : 0.55} />
              <Stop offset="0.6" stopColor={palette[1]} stopOpacity={entry?.sky_colors ? 1 : 0.3} />
              <Stop offset="1" stopColor={palette[2]} stopOpacity={entry?.sky_colors ? 1 : 0.2} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="10" height="10" fill={`url(#d${day})`} />
        </Svg>
      ) : null}
      <Text style={[styles.cellDay, entry && styles.cellDayFilled]}>{day}</Text>
      {mood ? <Text style={styles.cellEmoji}>{mood.emoji}</Text> : null}
      {entry?.sky_colors ? <Text style={styles.cellCamera}>📷</Text> : null}
    </TouchableOpacity>
  );
}

export default function SkyDiaryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  // Seven equal columns across the content width.
  const { width: screenWidth } = useWindowDimensions();
  const cellSize = Math.floor((screenWidth - spacing.lg * 2 - CELL_GAP * 6) / 7);
  const [entries, setEntries] = useState<SkyDiaryDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      fetchSkyDiary(user.id)
        .then((d) => {
          setEntries(d);
          setFailed(false);
        })
        .catch(() => setFailed(true))
        .finally(() => setLoading(false));
    }, [user])
  );

  const byDay = useMemo(() => new Map(entries.map((e) => [e.day, e])), [entries]);

  // Little stats, all from your own diary.
  const stats = useMemo(() => {
    const tally = new Map<SkyMood, number>();
    entries.forEach((e) => tally.set(e.mood, (tally.get(e.mood) ?? 0) + 1));
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    // Current streak of consecutive days ending today or yesterday.
    let streak = 0;
    const cursor = new Date();
    if (!byDay.has(ymd(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (byDay.has(ymd(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return { days: entries.length, top, streak };
  }, [entries, byDay]);

  // First and latest moods, oldest → newest, for the "how it's changed" line.
  const journey = useMemo(() => [...entries].reverse().slice(-14), [entries]);

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leading = month.getDay();
  const todayKey = ymd(new Date());
  const isCurrentMonth = month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth();
  const selected = selectedDay ? byDay.get(selectedDay) ?? null : null;

  const shiftMonth = (delta: number) => {
    Haptics.selectionAsync();
    setSelectedDay(null);
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Sky Diary</Text>
          <Text style={styles.subtitle}>Your days, one sky at a time</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        {loading ? (
          <ActivityIndicator color={colors.sticker.lilac} style={{ marginTop: spacing.xxl }} />
        ) : failed ? (
          <Text style={styles.empty}>Couldn't open your diary. Pull back and try again.</Text>
        ) : (
          <>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{stats.days}</Text>
                <Text style={styles.statLabel}>{stats.days === 1 ? 'day in the sky' : 'days in the sky'}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{stats.streak}🔥</Text>
                <Text style={styles.statLabel}>day streak</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{stats.top ? skyMood(stats.top).emoji : '—'}</Text>
                <Text style={styles.statLabel}>most often</Text>
              </View>
            </View>

            {journey.length >= 2 ? (
              <View style={styles.journey}>
                <Text style={styles.sectionLabel}>Your journey so far</Text>
                <View style={styles.journeyRow}>
                  {journey.map((e, i) => (
                    <View key={e.day} style={styles.journeyStep}>
                      <Text style={styles.journeyEmoji}>{skyMood(e.mood).emoji}</Text>
                      {i < journey.length - 1 ? <View style={styles.journeyDot} /> : null}
                    </View>
                  ))}
                </View>
                <Text style={styles.journeyCaption}>
                  From {skyMood(journey[0].mood).label.toLowerCase()} to {skyMood(journey[journey.length - 1].mood).label.toLowerCase()} — every step counts.
                </Text>
              </View>
            ) : null}

            <View style={styles.monthRow}>
              <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.iconButton} accessibilityLabel="Previous month">
                <Ionicons name="chevron-back" size={18} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.monthTitle}>
                {month.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity
                onPress={() => shiftMonth(1)}
                style={[styles.iconButton, isCurrentMonth && { opacity: 0.3 }]}
                disabled={isCurrentMonth}
                accessibilityLabel="Next month"
              >
                <Ionicons name="chevron-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.grid}>
              {WEEKDAYS.map((w, i) => (
                <Text key={i} style={[styles.weekday, { width: cellSize }]}>
                  {w}
                </Text>
              ))}
              {Array.from({ length: leading }, (_, i) => (
                <View key={`b${i}`} style={[styles.cellBlank, { width: cellSize }]} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const key = ymd(new Date(month.getFullYear(), month.getMonth(), i + 1));
                return (
                  <DayCell
                    key={key}
                    day={i + 1}
                    entry={byDay.get(key)}
                    isToday={key === todayKey}
                    size={cellSize}
                    selected={key === selectedDay}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedDay(key === selectedDay ? null : key);
                    }}
                  />
                );
              })}
            </View>

            {selected ? (
              <View style={styles.pageCard}>
                <Text style={styles.pageDate}>
                  {new Date(selected.day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </Text>
                <Text style={styles.pageMood}>
                  {skyMood(selected.mood).emoji} You felt {skyMood(selected.mood).label.toLowerCase()}
                </Text>
                {selected.note ? <Text style={styles.pageNote}>“{selected.note}”</Text> : null}
                {selected.sky_colors ? (
                  <View style={styles.pageSky}>
                    {selected.sky_colors.map((c, i) => (
                      <View key={i} style={{ flex: 1, backgroundColor: c }} />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : entries.length === 0 ? (
              <Text style={styles.empty}>
                Put up a star in School Sky and today becomes the first page of your diary. 🌙
              </Text>
            ) : (
              <Text style={styles.hint}>Tap a day to open that page</Text>
            )}

            <View style={styles.legend}>
              {SKY_MOODS.map((m) => (
                <Text key={m.key} style={styles.legendItem}>
                  {m.emoji} {m.label}
                </Text>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const CELL_GAP = 6;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.xl,
    color: '#fff',
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.sticker.lilac,
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  statNumber: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.xl,
    color: '#fff',
  },
  statLabel: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  journey: {
    gap: spacing.sm,
  },
  journeyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: spacing.sm,
  },
  journeyStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  journeyEmoji: {
    fontSize: 20,
  },
  journeyDot: {
    width: 10,
    height: 2,
    marginHorizontal: 3,
    borderRadius: 1,
    backgroundColor: colors.border,
  },
  journeyCaption: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthTitle: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.lg,
    color: '#fff',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CELL_GAP,
  },
  weekday: {
    textAlign: 'center',
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  cellBlank: {
    aspectRatio: 0.8,
  },
  cell: {
    aspectRatio: 0.8,
    borderRadius: radius.sm,
    backgroundColor: colors.cardBg,
    overflow: 'hidden',
    padding: 4,
    justifyContent: 'space-between',
  },
  cellSelected: {
    borderWidth: 2,
    borderColor: colors.sticker.yellow,
  },
  cellToday: {
    borderWidth: 1.5,
    borderColor: colors.sticker.lilac,
  },
  cellDay: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    color: colors.textLight,
  },
  cellDayFilled: {
    color: '#fff',
  },
  cellEmoji: {
    fontSize: 16,
    alignSelf: 'center',
  },
  cellCamera: {
    position: 'absolute',
    right: 3,
    top: 3,
    fontSize: 8,
  },
  pageCard: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pageDate: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.md,
    color: colors.sticker.lilac,
  },
  pageMood: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  pageNote: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textMid,
  },
  pageSky: {
    height: 40,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textLight,
    textAlign: 'center',
  },
  empty: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  legendItem: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
});
