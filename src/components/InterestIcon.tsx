import React from 'react';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';
import { colors } from '../constants/theme';
import NSIcon from './NSIcon';

// Interest stickers in the same style as NSIcon (ink outline, pastel fill,
// 48×48 grid). Replaces the platform emoji from getInterestIcon() wherever
// an interest is drawn as a chip; unknown/custom interests fall back to the
// sparkles sticker.

const INK = colors.textDark;
const SW = 2.6;
const { yellow: YELLOW, pink: PINK, mint: MINT, lilac: LILAC, blue: BLUE } = colors.sticker;
const ORANGE = '#FFA45C';
const WHITE = '#FFFFFF';

const s = { stroke: INK, strokeWidth: SW, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
const thin = { stroke: INK, strokeWidth: SW * 0.7, strokeLinecap: 'round' as const, fill: 'none' };

function Basketball() {
  return (
    <G>
      <Circle cx={24} cy={24} r={18} fill={ORANGE} {...s} />
      <Path d="M6 24 h36 M24 6 v36" {...thin} />
      <Path d="M11 11 q8 13 0 26 M37 11 q-8 13 0 26" {...thin} />
    </G>
  );
}

function Soccer() {
  return (
    <G>
      <Circle cx={24} cy={24} r={18} fill={WHITE} {...s} />
      <Path d="M24 16 l7 5 l-2.7 8.3 h-8.6 L17 21 z" fill={INK} />
      <Path d="M24 16 v-8 M31 21 l7.5 -2.5 M28.3 29.3 l4.7 6.7 M19.7 29.3 l-4.7 6.7 M17 21 l-7.5 -2.5" {...thin} />
    </G>
  );
}

function Gaming() {
  return (
    <G rotation={-6} origin="24, 24">
      <Path d="M12 14 h24 a9 9 0 0 1 9 10 l-2 10 a5 5 0 0 1 -8.5 2.5 L30 32 H18 l-4.5 4.5 A5 5 0 0 1 5 34 L3 24 a9 9 0 0 1 9 -10 z" fill={LILAC} {...s} />
      <Path d="M14 20 v8 M10 24 h8" stroke={INK} strokeWidth={SW * 1.1} strokeLinecap="round" />
      <Circle cx={33} cy={21} r={2.4} fill={PINK} stroke={INK} strokeWidth={SW * 0.6} />
      <Circle cx={37} cy={26} r={2.4} fill={MINT} stroke={INK} strokeWidth={SW * 0.6} />
    </G>
  );
}

function Music() {
  return (
    <G>
      <Path d="M18 34 V12 l20 -5 v22" fill="none" {...s} />
      <Path d="M18 12 l20 -5 v6 l-20 5 z" fill={INK} />
      <Ellipse cx={13} cy={35} rx={6} ry={4.8} fill={PINK} {...s} rotation={-15} origin="13, 35" />
      <Ellipse cx={33} cy={30} rx={6} ry={4.8} fill={PINK} {...s} rotation={-15} origin="33, 30" />
    </G>
  );
}

function Guitar() {
  return (
    <G rotation={35} origin="24, 24">
      <Rect x={21} y={2} width={6} height={20} rx={2} fill="#C98A55" {...s} />
      <Rect x={19.5} y={1} width={9} height={5} rx={2} fill={INK} />
      <Path d="M24 20 c-8 0 -11 4 -9 9 c-5 2 -6 9 -1 13 c4 3 16 3 20 0 c5 -4 4 -11 -1 -13 c2 -5 -1 -9 -9 -9 z" fill={YELLOW} {...s} />
      <Circle cx={24} cy={31} r={3} fill={INK} />
      <Line x1={20} y1={39} x2={28} y2={39} {...thin} />
    </G>
  );
}

function Art() {
  return (
    <G rotation={-8} origin="24, 24">
      <Path d="M24 6 C13 6 5 14 5 24 c0 10 8 18 17 18 c4 0 5 -3 3 -6 c-2 -3 0 -6 4 -6 h6 c5 0 8 -3 8 -8 C43 13 35 6 24 6 z" fill="#FFE8C7" {...s} />
      <Circle cx={15} cy={21} r={3.3} fill={PINK} stroke={INK} strokeWidth={SW * 0.6} />
      <Circle cx={22} cy={14} r={3.3} fill={YELLOW} stroke={INK} strokeWidth={SW * 0.6} />
      <Circle cx={31} cy={15} r={3.3} fill={MINT} stroke={INK} strokeWidth={SW * 0.6} />
      <Circle cx={15} cy={31} r={3.3} fill={BLUE} stroke={INK} strokeWidth={SW * 0.6} />
    </G>
  );
}

function Reading() {
  return (
    <G>
      <Path d="M24 13 C18 9 10 9 4 11 v25 c6 -2 14 -2 20 2 z" fill={BLUE} {...s} />
      <Path d="M24 13 c6 -4 14 -4 20 -2 v25 c-6 -2 -14 -2 -20 2 z" fill={WHITE} {...s} />
      <Path d="M29 19 h10 M29 24 h10 M29 29 h7" {...thin} />
    </G>
  );
}

function Photography() {
  return (
    <G>
      <Path d="M16 12 l3 -5 h10 l3 5" fill={LILAC} {...s} />
      <Rect x={4} y={12} width={40} height={28} rx={6} fill={LILAC} {...s} />
      <Circle cx={24} cy={26} r={9} fill={WHITE} {...s} />
      <Circle cx={24} cy={26} r={4.5} fill={BLUE} stroke={INK} strokeWidth={SW * 0.6} />
      <Circle cx={37} cy={18} r={2} fill={PINK} />
    </G>
  );
}

function Movies() {
  return (
    <G>
      <Rect x={5} y={19} width={38} height={23} rx={4} fill={INK} />
      <Rect x={8} y={23} width={32} height={15} rx={2} fill={WHITE} />
      <G rotation={-14} origin="6, 18">
        <Rect x={5} y={10} width={38} height={8} rx={2} fill={WHITE} {...s} />
        <Path d="M12 10 l-4 8 M21 10 l-4 8 M30 10 l-4 8 M39 10 l-4 8" stroke={INK} strokeWidth={SW * 1.1} />
      </G>
      <Path d="M21 26 v9 l8 -4.5 z" fill={PINK} stroke={INK} strokeWidth={SW * 0.6} strokeLinejoin="round" />
    </G>
  );
}

function Cooking() {
  return (
    <G>
      <Line x1={33} y1={30} x2={45} y2={36} stroke={INK} strokeWidth={5} strokeLinecap="round" />
      <Ellipse cx={20} cy={27} rx={16} ry={11} fill="#7A7A99" {...s} />
      <Path d="M12 24 c-1 -6 7 -9 11 -6 c4 -3 12 0 10 6 c3 4 -3 9 -10 8 c-7 1 -14 -3 -11 -8 z" fill={WHITE} stroke={INK} strokeWidth={SW * 0.7} />
      <Circle cx={22} cy={25} r={4} fill={YELLOW} stroke={INK} strokeWidth={SW * 0.6} />
    </G>
  );
}

function Fitness() {
  return (
    <G rotation={-20} origin="24, 24">
      <Line x1={10} y1={24} x2={38} y2={24} stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <Rect x={5} y={14} width={7} height={20} rx={2.5} fill={PINK} {...s} />
      <Rect x={36} y={14} width={7} height={20} rx={2.5} fill={PINK} {...s} />
      <Rect x={11} y={17} width={5} height={14} rx={2} fill={LILAC} {...s} />
      <Rect x={32} y={17} width={5} height={14} rx={2} fill={LILAC} {...s} />
    </G>
  );
}

function Swimming() {
  return (
    <G>
      <Circle cx={24} cy={19} r={12} fill={PINK} {...s} />
      <Circle cx={24} cy={19} r={5} fill={colors.background} {...s} />
      <Path d="M14 12 l4 4 M34 12 l-4 4 M14 26 l4 -4 M34 26 l-4 -4" stroke={WHITE} strokeWidth={3} strokeLinecap="round" />
      <Path d="M3 34 q5 -4 10 0 t10 0 t10 0 t11 0" fill="none" stroke={BLUE} strokeWidth={4} strokeLinecap="round" />
      <Path d="M3 42 q5 -4 10 0 t10 0 t10 0 t11 0" fill="none" stroke={BLUE} strokeWidth={4} strokeLinecap="round" />
    </G>
  );
}

function Travel() {
  return (
    <G rotation={-10} origin="24, 24">
      <Path d="M4 22 L44 6 L32 42 L23 28 z" fill={WHITE} {...s} />
      <Path d="M23 28 L44 6 L18 25 z" fill={BLUE} {...s} />
      <Path d="M23 28 l-2 10 l6 -6" fill={BLUE} {...s} />
      <Path d="M4 36 q4 -3 8 0" {...thin} />
    </G>
  );
}

function Coding() {
  return (
    <G>
      <Rect x={7} y={8} width={34} height={24} rx={4} fill={INK} />
      <Rect x={10} y={11} width={28} height={18} rx={2} fill={MINT} />
      <Path d="M18 16 l-4 4 l4 4 M30 16 l4 4 l-4 4 M26 15 l-4 10" stroke={INK} strokeWidth={SW * 0.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M3 36 h42 l-3 5 H6 z" fill={LILAC} {...s} />
    </G>
  );
}

function Technology() {
  return (
    <G rotation={8} origin="24, 24">
      <Rect x={13} y={4} width={22} height={40} rx={5} fill={INK} />
      <Rect x={16} y={9} width={16} height={28} rx={2} fill={BLUE} />
      <Circle cx={24} cy={40.5} r={1.6} fill={WHITE} />
      <Rect x={19} y={14} width={4} height={4} rx={1} fill={YELLOW} />
      <Rect x={25} y={14} width={4} height={4} rx={1} fill={PINK} />
      <Rect x={19} y={20} width={4} height={4} rx={1} fill={MINT} />
    </G>
  );
}

function Science() {
  return (
    <G>
      <Ellipse cx={24} cy={24} rx={19} ry={7.5} fill="none" {...s} />
      <Ellipse cx={24} cy={24} rx={19} ry={7.5} fill="none" {...s} rotation={60} origin="24, 24" />
      <Ellipse cx={24} cy={24} rx={19} ry={7.5} fill="none" {...s} rotation={-60} origin="24, 24" />
      <Circle cx={24} cy={24} r={5} fill={PINK} {...s} />
      <Circle cx={41} cy={22} r={2.4} fill={YELLOW} stroke={INK} strokeWidth={SW * 0.5} />
    </G>
  );
}

function Biology() {
  return (
    <G rotation={-12} origin="24, 24">
      <Path d="M8 40 C6 22 16 8 40 6 C42 30 28 42 8 40 z" fill={MINT} {...s} />
      <Path d="M8 40 L32 16 M16 32 l-1 -8 M22 26 l-1 -8 M20 29 h8 M26 22 h8" {...thin} />
    </G>
  );
}

function Chemistry() {
  return (
    <G>
      <Path d="M18 5 h12 M20 5 v13 L8 38 a4 4 0 0 0 3.5 6 h25 a4 4 0 0 0 3.5 -6 L28 18 V5" fill={WHITE} {...s} />
      <Path d="M12.5 31 h23 l4 7 a4 4 0 0 1 -3.5 6 h-24 a4 4 0 0 1 -3.5 -6 z" fill={LILAC} />
      <Path d="M20 5 v13 L8 38 a4 4 0 0 0 3.5 6 h25 a4 4 0 0 0 3.5 -6 L28 18 V5" fill="none" {...s} />
      <Circle cx={22} cy={37} r={2} fill={WHITE} />
      <Circle cx={28} cy={34} r={1.4} fill={WHITE} />
    </G>
  );
}

function Physics() {
  return (
    <G rotation={-20} origin="24, 24">
      <Path d="M10 6 v18 a14 14 0 0 0 28 0 V6 h-9 v18 a5 5 0 0 1 -10 0 V6 z" fill={PINK} {...s} />
      <Rect x={10} y={6} width={9} height={7} fill={WHITE} {...s} />
      <Rect x={29} y={6} width={9} height={7} fill={WHITE} {...s} />
      <Path d="M44 34 l3 2 M42 40 l4 0 M39 44 l2 3" {...thin} />
    </G>
  );
}

function MathIcon() {
  return (
    <G rotation={-6} origin="24, 24">
      <Rect x={7} y={4} width={34} height={40} rx={6} fill={YELLOW} {...s} />
      <Rect x={11} y={8} width={26} height={9} rx={2} fill={WHITE} {...s} />
      <Path d="M14 25 h6 M17 22 v6 M28 25 h6 M14 36 l5 -5 M14 31 l5 5 M28 34 h6 M28 37 h6" stroke={INK} strokeWidth={SW * 0.8} strokeLinecap="round" />
    </G>
  );
}

function Writing() {
  return (
    <G rotation={40} origin="24, 24">
      <Rect x={19} y={2} width={10} height={32} rx={2} fill={YELLOW} {...s} />
      <Rect x={19} y={2} width={10} height={6} rx={2} fill={PINK} {...s} />
      <Path d="M19 34 l5 10 l5 -10 z" fill="#FFE8C7" {...s} />
      <Path d="M22.5 41 l1.5 3 l1.5 -3 z" fill={INK} />
    </G>
  );
}

const ICONS: Record<string, () => React.JSX.Element> = {
  Basketball,
  Soccer,
  Gaming,
  Music,
  Guitar,
  Art,
  Reading,
  Photography,
  Movies,
  Cooking,
  Fitness,
  Swimming,
  Travel,
  Coding,
  'Computer Science': Coding,
  Technology,
  Science,
  Biology,
  Chemistry,
  Physics,
  Math: MathIcon,
  Writing,
};

type Props = {
  interest: string;
  size?: number;
};

export default function InterestIcon({ interest, size = 20 }: Props) {
  const Icon = ICONS[interest];
  if (!Icon) return <NSIcon name="sparkles" size={size} />;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Icon />
    </Svg>
  );
}
