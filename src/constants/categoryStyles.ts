import { Ionicons } from '@expo/vector-icons';
import { colors } from './theme';
import { PostCategory } from '../types';

type CategoryStyle = {
  bg: string;
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export const CATEGORY_STYLES: Record<PostCategory, CategoryStyle> = {
  'Need Help': { bg: colors.secondaryLight, text: colors.secondary, icon: 'hand-left' },
  'School Question': { bg: colors.primaryLight, text: colors.primary, icon: 'school' },
  'Looking for Friends': { bg: colors.accentLight, text: colors.accent, icon: 'people' },
};
