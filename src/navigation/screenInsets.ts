import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/theme';

// Android draws edge-to-edge on this SDK, and every stack screen hides the
// native header — so without this, a screen's own top content (Back buttons,
// banners, titles) slides up under the status bar clock. One shared
// contentStyle for every stack keeps that space reserved in one place,
// instead of each screen remembering insets.top.
export function useScreenContentStyle() {
  const insets = useSafeAreaInsets();
  return { paddingTop: insets.top, backgroundColor: colors.background };
}

// For screens that handle the top edge themselves (full-screen viewers, the
// login intro that paints behind the status bar) or nested navigators whose
// own screens already get the padding — so it's never applied twice.
export const NO_TOP_INSET = { paddingTop: 0 };

// iOS "modal" sheets already start below the status bar.
export const MODAL_TOP_INSET = Platform.OS === 'ios' ? NO_TOP_INSET : undefined;
