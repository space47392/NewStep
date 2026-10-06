import { Ionicons } from '@expo/vector-icons';
import { colors } from './theme';
import { PostCategory } from '../types';
import type { NSIconName } from '../components/NSIcon';

type CategoryStyle = {
  bg: string;
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
  // NewStep's own sticker icon for the category (CategoryBadge, CreatePost).
  nsIcon: NSIconName;
};

export const CATEGORY_STYLES: Record<PostCategory, CategoryStyle> = {
  'Need Help': { bg: colors.secondaryLight, text: colors.secondaryDark, icon: 'hand-left', nsIcon: 'ask' },
  'School Question': { bg: colors.primaryLight, text: colors.primary, icon: 'school', nsIcon: 'cap' },
  'Looking for Friends': { bg: colors.accentLight, text: colors.accentDark, icon: 'people', nsIcon: 'wave' },
  Event: { bg: colors.primaryLight, text: colors.primary, icon: 'calendar', nsIcon: 'party' },
};
