import { ReactNode, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Animated, Easing, Image, ScrollView, StyleSheet, useAnimatedValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient, Rect, Circle, Stop } from 'react-native-svg';
import { soundsLikeCrisis } from '../../lib/crisis';
import { SkyTile, SkyWindow, FALLBACK_SCENE, skiesFor, currentSlot, scenesFor } from '../SkyCheckSheet';
import { skyPhase } from '../SkyScene';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StarDraft } from '../../lib/useStarDraft';
import MoodFace from '../MoodFace';
import SupportLines from '../SupportLines';
import FadeInView from '../FadeInView';
import { skyMood, SKY_MOODS, SKY_NOTE_MAX, SkyMood } from '../../lib/sky';
import PrimaryButton from '../PrimaryButton';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';

// After a face is picked, the composer asks a question that fits it.
// Answering is always optional — a star can go up without words.
const FOLLOW_UPS: Record<SkyMood, { q: string; placeholder: string }> = {
  happy: { q: 'Nice! What made today good?', placeholder: 'Even something small counts…' },
  excited: { q: "Ooh, what's got you excited?", placeholder: 'Tell your school about it…' },
  chill: { q: "Love that. What's keeping it calm?", placeholder: 'A quiet moment, a good song…' },
  nervous: { q: "What's making you nervous?", placeholder: 'A test, a new class, meeting people…' },
  tired: { q: 'Long day? What wore you out?', placeholder: "It's okay to just rest…" },
  down: { q: "I'm sorry it's heavy. Want to say what happened?", placeholder: 'Only if you want to…' },
};

// Each composer step slides in from its side, so moving between them feels
// like turning to the next page.
function SlideIn({ from, children }: { from: number; children: ReactNode }) {
  const t = useAnimatedValue(0);
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [t]);
  return (
    <Animated.View style={{ opacity: t, transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

// A soft four-point star that breathes in the window of the star composer.
function MoodStar({ color }: { color: string }) {
  const pulse = useAnimatedValue(0);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.cMoodStar,
        { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.12] }) }], opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
      ]}
    >
      <Svg width={34} height={34} viewBox="0 0 24 24">
        <Circle cx="12" cy="12" r="10" fill={color} opacity={0.35} />
        <Path d="M12 2.5 C12.8 8.6 15.4 11.2 21.5 12 C15.4 12.8 12.8 15.4 12 21.5 C11.2 15.4 8.6 12.8 2.5 12 C8.6 11.2 11.2 8.6 12 2.5 Z" fill="#FFFDF5" stroke={color} strokeWidth={1.2} />
      </Svg>
    </Animated.View>
  );
}

type Props = {
  visible: boolean;
  draft: StarDraft;
  // Editing today's star rather than putting up a new one.
  isUpdate: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  // Paints their own words; the screen shows the preview.
  onPaint: () => void;
  // Heavier days: say it as a nameless lantern, or breathe first.
  onLantern: () => void;
  onBreathe: () => void;
};

// The star composer: step 1 picks a feeling, step 2 asks a question made for
// it. Words, the sky and a photo are all optional.
export default function StarComposer({ visible, draft, isUpdate, saving, onClose, onSave, onPaint, onLantern, onBreathe }: Props) {
  const insets = useSafeAreaInsets();
  // Quick sky tiles, the same as the sky check on Home.
  const skies = skiesFor(currentSlot());
  const scenes = scenesFor(currentSlot(), skyPhase());
  const onTile = skies.some((c) => c.text === draft.skyText);
  // Typed words (not a tile) are what the paint button paints.
  const ownWords = draft.skyText.trim().length >= 2 && !onTile;
  const heavy = draft.mood === 'down' || draft.mood === 'nervous' || draft.mood === 'tired';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.cSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          {/* Today's sky through NewStep's window — your star waits in it,
              glowing in your mood's colour. */}
          <View style={styles.cHero}>
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="composerHero" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={(scenes[skies[0].label] ?? FALLBACK_SCENE).colors[0]} stopOpacity={0.55} />
                  <Stop offset="0.55" stopColor={(scenes[skies[0].label] ?? FALLBACK_SCENE).colors[2]} stopOpacity={0.35} />
                  <Stop offset="1" stopColor={colors.background} stopOpacity={1} />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#composerHero)" />
            </Svg>
            <View style={[styles.cHandle, styles.cHandleOnSky]} />
            <View>
              <SkyWindow scene={draft.skyScene ?? scenes[skies[0].label] ?? FALLBACK_SCENE} width={112} />
              <MoodStar color={draft.moodPicked ? SKY_MOODS.find((m) => m.key === draft.mood)?.color ?? colors.primary : colors.primary} />
            </View>
          </View>
          <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.cContent} keyboardShouldPersistTaps="handled">
          {!draft.moodPicked ? (
            // Step 1: just the feeling.
            <SlideIn key="mood" from={-36}>
              <Text style={styles.cTitle}>How are you, really?</Text>
              <Text style={styles.cSub}>Tap the one that feels closest.</Text>
              <View style={styles.cMoodGrid}>
                {SKY_MOODS.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={styles.cMoodTile}
                    activeOpacity={0.8}
                    onPress={() => draft.pickMood(m.key)}
                    accessibilityRole="button"
                    accessibilityLabel={m.label}
                  >
                    <View style={[styles.cMoodTileFace, { backgroundColor: m.color + '33' }]}>
                      <MoodFace mood={m.key} size={46} />
                    </View>
                    <Text style={styles.cMoodTileLabel}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </SlideIn>
          ) : (
            // Step 2: a question made for that feeling. Answering is up to them.
            <SlideIn key="share" from={36}>
              <View style={styles.cStepBar}>
                <TouchableOpacity
                  style={styles.cBack}
                  onPress={() => draft.setMoodPicked(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Pick a different feeling"
                >
                  <Ionicons name="chevron-back" size={18} color={colors.textMid} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cMoodChip, { backgroundColor: skyMood(draft.mood).color + '40' }]} onPress={() => draft.setMoodPicked(false)} activeOpacity={0.8}>
                  <MoodFace mood={draft.mood} size={22} />
                  <Text style={styles.cMoodChipText}>Feeling {skyMood(draft.mood).label.toLowerCase()}</Text>
                </TouchableOpacity>
                <View style={styles.cBack} />
              </View>

              <Text style={[styles.cTitle, styles.cQuestion]}>{FOLLOW_UPS[draft.mood].q}</Text>
              <TextInput
                style={[styles.cInput, styles.cHeart]}
                placeholder={FOLLOW_UPS[draft.mood].placeholder}
                placeholderTextColor={colors.textLight}
                value={draft.note}
                onChangeText={draft.setNote}
                maxLength={SKY_NOTE_MAX}
                multiline
              />
              <Text style={styles.cOptional}>Only if you want to · classmates see it with your star</Text>
              {soundsLikeCrisis(draft.note) ? (
                <FadeInView style={styles.cSupport}>
                  <SupportLines tone="light" />
                </FadeInView>
              ) : null}

              {/* A heavier day gets a gentle way to say it with no name. */}
              {heavy ? (
                <TouchableOpacity
                  style={styles.cHeavy}
                  activeOpacity={0.85}
                  onPress={onLantern}
                  accessibilityRole="button"
                >
                  <Text style={styles.cHeavyText}>
                    Rather say it with no name? <Text style={styles.cHeavyLink}>Send a lantern ›</Text>
                  </Text>
                </TouchableOpacity>
              ) : null}
              {heavy ? (
                <TouchableOpacity style={styles.cBreathe} onPress={onBreathe} accessibilityRole="button">
                  <Ionicons name="leaf-outline" size={14} color={colors.primaryDark} />
                  <Text style={styles.cHeavyLink}>Take a 1-minute breath first</Text>
                </TouchableOpacity>
              ) : null}
            </SlideIn>
          )}
          {draft.moodPicked ? (
          <>

          {/* Everything else is optional and tucked away. */}
          {draft.showSkyExtras ? (
            <View style={styles.cExtras}>
              <Text style={styles.cSection}>👀 What's the sky like?</Text>
            <View style={styles.cTiles}>
              {skies.map((c) => (
                <SkyTile
                  key={c.label}
                  choice={c}
                  scene={scenes[c.label]}
                  selected={draft.skyText === c.text}
                  onPress={() => draft.pickSky(c.text, scenes[c.label])}
                />
              ))}
            </View>
            <View style={styles.cFieldRow}>
              <TextInput
                style={[styles.cInput, { flex: 1 }]}
                placeholder="Or in your own words…"
                placeholderTextColor={colors.textLight}
                value={onTile ? '' : draft.skyText}
                onChangeText={draft.typeSky}
                maxLength={200}
              />
              <TouchableOpacity
                style={[styles.cIconButton, styles.cIconButtonFilled, !ownWords && { opacity: 0.4 }]}
                onPress={onPaint}
                disabled={draft.painting || !ownWords}
                accessibilityRole="button"
                accessibilityLabel={draft.skyScene ? 'Paint it again' : 'Paint my sky'}
              >
                {draft.painting ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Ionicons name="color-palette" size={18} color={colors.onPrimary} />
                )}
              </TouchableOpacity>
            </View>
            {draft.paintError ? <Text style={styles.paintError}>{draft.paintError}</Text> : null}
                <View style={[styles.cFieldRow, { justifyContent: 'flex-end' }]}>
                <Text style={styles.cPhotoLabel}>Add a photo of the sky</Text>
              {draft.photoUri ? (
                <TouchableOpacity onPress={draft.snapSky} onLongPress={draft.removePhoto} accessibilityLabel="Retake the sky photo. Hold to remove.">
                  <Image source={{ uri: draft.photoUri }} style={styles.notePhoto} />
                  <TouchableOpacity style={styles.photoRemove} onPress={draft.removePhoto} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Remove photo">
                    <Ionicons name="close" size={11} color={colors.warm.honeyInk} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.cIconButton} onPress={draft.snapSky} accessibilityLabel="Add a photo of the sky">
                  <Ionicons name="camera-outline" size={18} color={colors.textMid} />
                </TouchableOpacity>
              )}
                </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.cMore} onPress={() => draft.setShowSkyExtras(true)} accessibilityRole="button">
              <Ionicons name="add" size={16} color={colors.textMid} />
              <Text style={styles.cMoreText}>Add today's sky</Text>
            </TouchableOpacity>
          )}
          {draft.note.length > SKY_NOTE_MAX - 20 ? (
            <Text style={styles.cCount}>
              {draft.note.length}/{SKY_NOTE_MAX}
            </Text>
          ) : null}

          <PrimaryButton
            title={isUpdate ? 'Update my star' : 'Put it in the sky'}
            icon="sparkles"
            loading={saving}
            onPress={onSave}
            style={styles.sheetSave}
          />
          </>
          ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // The star composer: a bright sheet like the rest of the app.
  cSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '92%',
  },
  cHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  cContent: {
    paddingBottom: spacing.sm,
  },
  cTitle: {
    fontFamily: fontFamily.brand,
    fontSize: 26,
    color: colors.textDark,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  cSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    textAlign: 'center',
    marginTop: 2,
  },
  cHandleOnSky: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    marginBottom: spacing.sm,
  },
  cHero: {
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.sm,
    height: 136,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  cQuestion: {
    fontSize: 22,
    lineHeight: 28,
    marginTop: spacing.md,
  },
  cMoodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  cMoodTile: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  cMoodTileFace: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cMoodTileLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
    marginTop: 6,
  },
  cStepBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  cBack: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cMoodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  cMoodChipText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
  cBreathe: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: 4,
  },
  cExtras: {
    marginTop: spacing.sm,
  },
  cMore: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 4,
    marginTop: spacing.md,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: colors.hairline,
  },
  cMoreText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  cMoodStar: {
    position: 'absolute',
    top: 34,
    alignSelf: 'center',
  },
  cSupport: {
    marginTop: spacing.md,
  },
  cCount: {
    alignSelf: 'flex-end',
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: 4,
  },
  cOptional: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: 6,
  },
  cHeart: {
    marginTop: spacing.sm,
    minHeight: 92,
    textAlignVertical: 'top',
  },
  cPhotoLabel: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  cSection: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  cTiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.sm,
  },
  cFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cIconButton: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cIconButtonFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  cHeavy: {
    alignSelf: 'center',
    backgroundColor: '#FFF6E6',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  cHeavyText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    textAlign: 'center',
  },
  cHeavyLink: {
    fontFamily: fontFamily.semibold,
    color: colors.primaryDark,
  },
  cInput: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  sheetSave: {
    marginTop: spacing.sm,
  },
  notePhoto: {
    width: 48,
    height: 48,
    borderRadius: 14,
  },
  photoRemove: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.warm.honey,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paintError: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.secondaryDark,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(12,9,20,0.45)',
  },
});
