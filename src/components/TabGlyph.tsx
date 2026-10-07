import React from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { colors } from '../constants/theme';

// Bottom-tab icons in the NewStep sticker style, simplified for small sizes.
// Inactive: a plain gray outline. Active: ink outline + the tab's own pastel
// fill, so the selected tab reads at a glance.

export type TabGlyphName = 'home' | 'search' | 'help' | 'chat' | 'community' | 'profile';

const { yellow, pink, mint, lilac, blue } = colors.sticker;
const FILLS: Record<TabGlyphName, string> = {
  home: yellow,
  search: blue,
  help: pink,
  chat: mint,
  community: lilac,
  profile: yellow,
};

type Props = {
  name: TabGlyphName;
  active: boolean;
  size?: number;
};

export default function TabGlyph({ name, active, size = 26 }: Props) {
  const ink = active ? colors.textDark : colors.tabInactive;
  const fill = active ? FILLS[name] : 'none';
  const s = { stroke: ink, strokeWidth: 3.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

  let body: React.ReactNode;
  switch (name) {
    case 'home':
      body = (
        <G>
          <Path d="M7 22 L24 8 L41 22 V40 a3 3 0 0 1 -3 3 H10 a3 3 0 0 1 -3 -3 z" fill={fill} {...s} />
          <Path d="M19 43 V32 a5 5 0 0 1 10 0 V43" fill={active ? colors.cardBg : 'none'} {...s} />
        </G>
      );
      break;
    case 'search':
      body = (
        <G>
          <Circle cx={21} cy={21} r={13} fill={fill} {...s} />
          <Path d="M31 31 L42 42" {...s} strokeWidth={5} />
        </G>
      );
      break;
    case 'help':
      // A raised hand — "I can help".
      body = (
        <Path
          d="M14 25 V12 a3 3 0 0 1 6 0 V22 V9 a3 3 0 0 1 6 0 V22 V11 a3 3 0 0 1 6 0 V24 V17 a3 3 0 0 1 6 0 V30 c0 8 -6 14 -13 14 c-6 0 -10 -3 -13 -8 l-5 -8 a3 3 0 0 1 5 -3 z"
          fill={fill}
          {...s}
        />
      );
      break;
    case 'chat':
      body = (
        <G>
          <Path
            d="M10 8 h28 a6 6 0 0 1 6 6 v14 a6 6 0 0 1 -6 6 H22 l-10 8 v-8 h-2 a6 6 0 0 1 -6 -6 V14 a6 6 0 0 1 6 -6 z"
            fill={fill}
            {...s}
          />
          {active && (
            <G fill={colors.textDark}>
              <Circle cx={16} cy={21} r={2.4} />
              <Circle cx={24} cy={21} r={2.4} />
              <Circle cx={32} cy={21} r={2.4} />
            </G>
          )}
        </G>
      );
      break;
    case 'community':
      body = (
        <G>
          <Circle cx={32} cy={15} r={6} fill={active ? pink : 'none'} {...s} />
          <Path d="M24 40 a11 11 0 0 1 20 -6 V40 z" fill={active ? pink : 'none'} {...s} />
          <Circle cx={17} cy={17} r={7} fill={fill} {...s} />
          <Path d="M4 42 a13 13 0 0 1 26 0 z" fill={fill} {...s} />
        </G>
      );
      break;
    case 'profile':
      body = (
        <G>
          <Circle cx={24} cy={16} r={9} fill={fill} {...s} />
          <Path d="M8 43 a16 16 0 0 1 32 0 z" fill={fill} {...s} />
        </G>
      );
      break;
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {body}
    </Svg>
  );
}

