import { useCallback, useState } from 'react';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { askPermission } from '../components/askPermission';
import { describeSky, SkyMood, SkyScene, SkyStar } from './sky';
import { hasBlockedWords, KIND_WORDS_MESSAGE } from './contentFilter';
import { errorMessage } from './errors';
import type { SkyPhase } from '../components/SkyScene';

// The star being written in School Sky's composer: the feeling, the words,
// the sky photo and the student's description of the sky.

// A saved star's description, as the scene it was painted into.
export function sceneFromStar(star: SkyStar | null): SkyScene | null {
  if (!star?.sky_desc || !star.sky_colors || !star.sky_title) return null;
  return { colors: star.sky_colors, clouds: star.sky_clouds ?? 'few', cloud_color: '#ffffff', things: star.sky_things ?? [], title: star.sky_title };
}

export function useStarDraft(phase: SkyPhase) {
  const [mood, setMood] = useState<SkyMood>('happy');
  // False until a face is tapped on a new star: the follow-up waits for it.
  const [moodPicked, setMoodPicked] = useState(false);
  const [note, setNote] = useState('');
  // The sky photo: the saved one (a URL), a fresh camera shot (a local file,
  // uploaded on save), or none.
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoIsNew, setPhotoIsNew] = useState(false);
  // "Look up": their own words about the sky, and how it was painted.
  const [skyText, setSkyText] = useState('');
  const [skyScene, setSkyScene] = useState<SkyScene | null>(null);
  const [painting, setPainting] = useState(false);
  const [paintError, setPaintError] = useState<string | null>(null);
  // The composer stays simple; the sky bits open only if you want them.
  const [showSkyExtras, setShowSkyExtras] = useState(false);

  // Start from my current star (editing) or from scratch (a new one).
  // Only calls setters, so it's stable and safe in effect dependencies.
  const fillFrom = useCallback((star: SkyStar | null) => {
    setShowSkyExtras(false);
    setMood(star?.mood ?? 'happy');
    setMoodPicked(!!star);
    setNote(star?.note ?? '');
    setPhotoUri(star?.photo_url ?? null);
    setPhotoIsNew(false);
    setSkyText(star?.sky_desc ?? '');
    setSkyScene(sceneFromStar(star));
    setPaintError(null);
  }, []);

  const pickMood = (next: SkyMood) => {
    Haptics.selectionAsync();
    setMood(next);
    setMoodPicked(true);
  };

  // One of the quick sky tiles: already painted.
  const pickSky = (text: string, scene: SkyScene) => {
    Haptics.selectionAsync();
    setSkyText(text);
    setPaintError(null);
    setSkyScene(scene);
  };

  const typeSky = (text: string) => {
    setSkyText(text);
    setPaintError(null);
  };

  // Camera only, on purpose: the point is to look up at the real sky now,
  // not to pick an old photo.
  const snapSky = async () => {
    if (!(await askPermission(ImagePicker.requestCameraPermissionsAsync, 'camera', 'to snap the sky'))) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [3, 4], quality: 0.6 });
    if (result.canceled || !result.assets?.length) return;
    setPhotoUri(result.assets[0].uri);
    setPhotoIsNew(true);
  };

  const removePhoto = () => setPhotoUri(null);

  // Paints their own words. Resolves true when there's a new scene to preview.
  const paint = async (): Promise<boolean> => {
    const text = skyText.trim();
    if (painting || text.length < 2) return false;
    if (hasBlockedWords(text)) {
      setPaintError(KIND_WORDS_MESSAGE);
      return false;
    }
    setPainting(true);
    setPaintError(null);
    try {
      const scene = await describeSky(text, phase);
      if (!scene) {
        setSkyScene(null);
        setPaintError("Let's keep it about the sky ☁️ Try describing what you see.");
        return false;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSkyScene(scene);
      return true;
    } catch (err) {
      setPaintError(errorMessage(err, "Couldn't paint the sky right now."));
      return false;
    } finally {
      setPainting(false);
    }
  };

  return {
    mood,
    moodPicked,
    note,
    photoUri,
    photoIsNew,
    skyText,
    skyScene,
    painting,
    paintError,
    showSkyExtras,
    setMoodPicked,
    setNote,
    setShowSkyExtras,
    fillFrom,
    pickMood,
    pickSky,
    typeSky,
    snapSky,
    removePhoto,
    paint,
  };
}

export type StarDraft = ReturnType<typeof useStarDraft>;
