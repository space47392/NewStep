import React from 'react';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';
import { colors } from '../constants/theme';

// NewStep's own sticker-style icon set — chunky ink outline, soft pastel
// fill, rounded everything — used in place of platform emoji wherever the
// app speaks in its own voice (help, waves, thanks, school...). Platform
// emoji look different on every phone; these look the same everywhere.

export type NSIconName =
  | 'wave'
  | 'help'
  | 'chat'
  | 'thanks'
  | 'party'
  | 'school'
  | 'steps'
  | 'star'
  | 'bookmark'
  | 'search'
  | 'trophy'
  | 'backpack'
  | 'sparkles'
  | 'ask'
  | 'sprout'
  | 'cap'
  | 'megaphone';

type Props = {
  name: NSIconName;
  size?: number;
};

const INK = colors.textDark;
const SW = 2.6; // outline width, in the 48×48 drawing grid

const YELLOW = '#FFD45C';
const PINK = '#FF9BB0';
const MINT = '#7EE6BE';
const LILAC = '#B7B1FF';
const BLUE = '#8FB4FF';

// A finger/arm: a fat ink line with a slightly thinner colored line on top
// gives a filled capsule with an outline, joined smoothly to whatever else
// is drawn in the same two passes.
function capsuleInk(x1: number, y1: number, x2: number, y2: number, w: number, key: string) {
  return <Line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth={w + SW * 2} strokeLinecap="round" />;
}
function capsuleFill(x1: number, y1: number, x2: number, y2: number, w: number, fill: string, key: string) {
  return <Line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={fill} strokeWidth={w} strokeLinecap="round" />;
}

function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((-90 + i * 36) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}

function Wave() {
  // Palm + four fingers + thumb, tilted mid-wave, with motion arcs.
  const fingers: [number, number, number, number][] = [
    [17, 25, 14, 11],
    [22, 23, 21, 8],
    [27, 23, 28, 9],
    [31, 26, 34, 15],
    [15, 32, 8, 26],
  ];
  return (
    <G>
      <G rotation={-12} origin="24, 28">
        {fingers.map(([a, b, c, d], i) => capsuleInk(a, b, c, d, 5.4, `i${i}`))}
        <Ellipse cx={23} cy={31} rx={11.5 + SW} ry={10.5 + SW} fill={INK} />
        {fingers.map(([a, b, c, d], i) => capsuleFill(a, b, c, d, 5.4, YELLOW, `f${i}`))}
        <Ellipse cx={23} cy={31} rx={11.5} ry={10.5} fill={YELLOW} />
        {/* Our signature: a tiny footprint on the palm. */}
        <Ellipse cx={23} cy={33} rx={2.6} ry={3.4} fill={PINK} />
        <Circle cx={21} cy={28.3} r={0.9} fill={PINK} />
        <Circle cx={23.2} cy={27.8} r={0.9} fill={PINK} />
        <Circle cx={25.3} cy={28.4} r={0.9} fill={PINK} />
      </G>
      <Path d="M38 8 q5 4 4 10" stroke={INK} strokeWidth={SW} fill="none" strokeLinecap="round" />
      <Path d="M41 4 q7 6 5 15" stroke={INK} strokeWidth={SW} fill="none" strokeLinecap="round" />
    </G>
  );
}

function Help() {
  // Two hands meeting in a high five — "I've got you".
  return (
    <G>
      {capsuleInk(15, 37, 20, 19, 12, 'lp')}
      {capsuleInk(13, 31, 7, 24, 5, 'lt')}
      {capsuleInk(33, 37, 28, 19, 12, 'rp')}
      {capsuleInk(35, 31, 41, 24, 5, 'rt')}
      {capsuleFill(15, 37, 20, 19, 12, PINK, 'lpf')}
      {capsuleFill(13, 31, 7, 24, 5, PINK, 'ltf')}
      {capsuleFill(33, 37, 28, 19, 12, MINT, 'rpf')}
      {capsuleFill(35, 31, 41, 24, 5, MINT, 'rtf')}
      {/* finger lines */}
      <Line x1={16.5} y1={17.5} x2={16.2} y2={22} stroke={INK} strokeWidth={SW * 0.6} strokeLinecap="round" />
      <Line x1={19.5} y1={16.5} x2={19.2} y2={21.5} stroke={INK} strokeWidth={SW * 0.6} strokeLinecap="round" />
      <Line x1={31.5} y1={17.5} x2={31.8} y2={22} stroke={INK} strokeWidth={SW * 0.6} strokeLinecap="round" />
      <Line x1={28.5} y1={16.5} x2={28.8} y2={21.5} stroke={INK} strokeWidth={SW * 0.6} strokeLinecap="round" />
      {/* the "clap" */}
      <Path d="M24 2 l1.6 4.2 l4.2 1.6 l-4.2 1.6 l-1.6 4.2 l-1.6 -4.2 l-4.2 -1.6 l4.2 -1.6 z" fill={YELLOW} stroke={INK} strokeWidth={SW * 0.7} strokeLinejoin="round" />
      <Line x1={14} y1={8} x2={16.5} y2={10.5} stroke={INK} strokeWidth={SW * 0.7} strokeLinecap="round" />
      <Line x1={34} y1={8} x2={31.5} y2={10.5} stroke={INK} strokeWidth={SW * 0.7} strokeLinecap="round" />
    </G>
  );
}

function Chat() {
  return (
    <G rotation={-6} origin="24, 24">
      <Path
        d="M11 9 h26 a7 7 0 0 1 7 7 v12 a7 7 0 0 1 -7 7 h-15 l-9 7 v-7 h-2 a7 7 0 0 1 -7 -7 v-12 a7 7 0 0 1 7 -7 z"
        fill={MINT}
        stroke={INK}
        strokeWidth={SW}
        strokeLinejoin="round"
      />
      <Circle cx={16} cy={22} r={2.4} fill={INK} />
      <Circle cx={24} cy={22} r={2.4} fill={INK} />
      <Circle cx={32} cy={22} r={2.4} fill={INK} />
    </G>
  );
}

function Thanks() {
  return (
    <G>
      <G rotation={-8} origin="24, 26">
        <Path
          d="M24 42 C10 33 5 25 5 18 a9.5 9.5 0 0 1 19 -4 a9.5 9.5 0 0 1 19 4 c0 7 -5 15 -19 24 z"
          fill={BLUE}
          stroke={INK}
          strokeWidth={SW}
          strokeLinejoin="round"
        />
        <Ellipse cx={14} cy={17} rx={3} ry={4.5} fill="#FFFFFF" opacity={0.75} rotation={-25} origin="14, 17" />
      </G>
      <Path d="M40 3 l1.5 4 l4 1.5 l-4 1.5 l-1.5 4 l-1.5 -4 l-4 -1.5 l4 -1.5 z" fill={YELLOW} stroke={INK} strokeWidth={SW * 0.7} strokeLinejoin="round" />
    </G>
  );
}

function Party() {
  return (
    <G>
      <Path d="M7 43 L17 15 L35 33 Z" fill={YELLOW} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M12 29 L23 40" stroke={PINK} strokeWidth={3} strokeLinecap="round" />
      <Path d="M15 21 L28 34" stroke={MINT} strokeWidth={3} strokeLinecap="round" />
      <Path d="M24 13 q3 -6 9 -5" stroke={INK} strokeWidth={SW} fill="none" strokeLinecap="round" />
      <Path d="M35 24 q6 -3 9 2" stroke={INK} strokeWidth={SW} fill="none" strokeLinecap="round" />
      <Circle cx={38} cy={9} r={2.6} fill={PINK} stroke={INK} strokeWidth={SW * 0.6} />
      <Circle cx={30} cy={4.5} r={1.8} fill={LILAC} stroke={INK} strokeWidth={SW * 0.6} />
      <Rect x={41} y={15} width={4.5} height={4.5} rx={1} fill={MINT} stroke={INK} strokeWidth={SW * 0.6} rotation={20} origin="43, 17" />
      <Circle cx={43} cy={33} r={1.8} fill={YELLOW} stroke={INK} strokeWidth={SW * 0.6} />
    </G>
  );
}

function School() {
  return (
    <G>
      <Line x1={24} y1={14} x2={24} y2={3} stroke={INK} strokeWidth={SW} strokeLinecap="round" />
      <Path d="M24 3.5 L34 6.5 L24 10 Z" fill={PINK} stroke={INK} strokeWidth={SW * 0.8} strokeLinejoin="round" />
      <Rect x={9} y={22} width={30} height={20} rx={3} fill={LILAC} stroke={INK} strokeWidth={SW} />
      <Path d="M6 24 L24 13 L42 24 Z" fill={colors.primary} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M20 42 v-8 a4 4 0 0 1 8 0 v8" fill={YELLOW} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <Rect x={12.5} y={27} width={5} height={5} rx={1.2} fill="#FFFFFF" stroke={INK} strokeWidth={SW * 0.7} />
      <Rect x={30.5} y={27} width={5} height={5} rx={1.2} fill="#FFFFFF" stroke={INK} strokeWidth={SW * 0.7} />
    </G>
  );
}

function Foot({ x, y, rot }: { x: number; y: number; rot: number }) {
  return (
    <G rotation={rot} origin={`${x}, ${y}`}>
      <Ellipse cx={x} cy={y + 3} rx={5.6} ry={8} fill={LILAC} stroke={INK} strokeWidth={SW} />
      <Ellipse cx={x} cy={y + 13.5} rx={4} ry={3.4} fill={LILAC} stroke={INK} strokeWidth={SW} />
      <Circle cx={x - 4.4} cy={y - 7.5} r={1.5} fill={INK} />
      <Circle cx={x - 1.5} cy={y - 8.6} r={1.5} fill={INK} />
      <Circle cx={x + 1.6} cy={y - 8.4} r={1.4} fill={INK} />
      <Circle cx={x + 4.3} cy={y - 7.2} r={1.3} fill={INK} />
    </G>
  );
}

function Steps() {
  return (
    <G>
      <Foot x={15} y={24} rot={-14} />
      <Foot x={33} y={16} rot={10} />
    </G>
  );
}

function Star() {
  return (
    <G rotation={8} origin="24, 25">
      <Path d={starPoints(24, 25.5, 20, 9.5)} fill={YELLOW} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <Circle cx={20.5} cy={24.5} r={1.6} fill={INK} />
      <Circle cx={27.5} cy={24.5} r={1.6} fill={INK} />
      <Path d="M21.5 29 q2.5 2.5 5 0" stroke={INK} strokeWidth={SW * 0.7} fill="none" strokeLinecap="round" />
    </G>
  );
}

function sparkle(cx: number, cy: number, r: number, fill: string, key: string) {
  const k = r * 0.28;
  return (
    <Path
      key={key}
      d={`M${cx} ${cy - r} L${cx + k} ${cy - k} L${cx + r} ${cy} L${cx + k} ${cy + k} L${cx} ${cy + r} L${cx - k} ${cy + k} L${cx - r} ${cy} L${cx - k} ${cy - k} Z`}
      fill={fill}
      stroke={INK}
      strokeWidth={SW * 0.8}
      strokeLinejoin="round"
    />
  );
}

function Bookmark() {
  return (
    <G rotation={-6} origin="24, 24">
      <Path
        d="M14 5 h20 a3 3 0 0 1 3 3 v35 l-13 -9 l-13 9 v-35 a3 3 0 0 1 3 -3 z"
        fill={PINK}
        stroke={INK}
        strokeWidth={SW}
        strokeLinejoin="round"
      />
      <Path
        d="M24 25 C18 21 17.5 18 17.5 16.5 a3.3 3.3 0 0 1 6.5 -1 a3.3 3.3 0 0 1 6.5 1 c0 1.5 -0.5 4.5 -6.5 8.5 z"
        fill="#FFFFFF"
        stroke={INK}
        strokeWidth={SW * 0.7}
        strokeLinejoin="round"
      />
    </G>
  );
}

function Search() {
  return (
    <G>
      {capsuleInk(30, 30, 40, 40, 6, 'hi')}
      {capsuleFill(30, 30, 40, 40, 6, YELLOW, 'hf')}
      <Circle cx={21} cy={20} r={13} fill="#DDEBFF" stroke={INK} strokeWidth={SW} />
      <Path d="M13.5 17 a8 8 0 0 1 6 -5.5" stroke="#FFFFFF" strokeWidth={3} fill="none" strokeLinecap="round" />
      {/* a little footprint being looked for */}
      <Ellipse cx={22} cy={23} rx={2.6} ry={3.6} fill={LILAC} stroke={INK} strokeWidth={SW * 0.5} />
      <Circle cx={19.8} cy={17.6} r={0.9} fill={INK} />
      <Circle cx={22} cy={17} r={0.9} fill={INK} />
      <Circle cx={24.2} cy={17.6} r={0.9} fill={INK} />
    </G>
  );
}

function Trophy() {
  return (
    <G>
      <Path d="M14 12 h-4 a5 5 0 0 0 5 9" stroke={INK} strokeWidth={SW} fill="none" strokeLinecap="round" />
      <Path d="M34 12 h4 a5 5 0 0 1 -5 9" stroke={INK} strokeWidth={SW} fill="none" strokeLinecap="round" />
      <Path d="M13 7 h22 v10 a11 11 0 0 1 -22 0 z" fill={YELLOW} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <Rect x={21} y={27} width={6} height={7} fill={YELLOW} stroke={INK} strokeWidth={SW} />
      <Rect x={13} y={34} width={22} height={8} rx={2.5} fill={LILAC} stroke={INK} strokeWidth={SW} />
      <Path d={starPoints(24, 16.5, 5.5, 2.6)} fill="#FFFFFF" stroke={INK} strokeWidth={SW * 0.6} strokeLinejoin="round" />
      {sparkle(42, 6, 3.5, PINK, 's1')}
    </G>
  );
}

function Backpack() {
  return (
    <G rotation={-6} origin="24, 26">
      <Path d="M19 12 a5 5 0 0 1 10 0" stroke={INK} strokeWidth={SW} fill="none" strokeLinecap="round" />
      <Rect x={10} y={11} width={28} height={32} rx={10} fill={MINT} stroke={INK} strokeWidth={SW} />
      <Path d="M10 22 q14 5 28 0" stroke={INK} strokeWidth={SW * 0.8} fill="none" strokeLinecap="round" />
      <Rect x={16} y={28} width={16} height={11} rx={3.5} fill={YELLOW} stroke={INK} strokeWidth={SW} />
      <Line x1={20} y1={31.5} x2={28} y2={31.5} stroke={INK} strokeWidth={SW * 0.6} strokeLinecap="round" />
      <Circle cx={31} cy={17} r={2.6} fill={PINK} stroke={INK} strokeWidth={SW * 0.6} />
    </G>
  );
}

function Sparkles() {
  return (
    <G>
      {sparkle(20, 25, 14, YELLOW, 'a')}
      {sparkle(37, 11, 7, PINK, 'b')}
      {sparkle(37, 37, 5.5, LILAC, 'c')}
    </G>
  );
}

function Ask() {
  return (
    <G rotation={6} origin="24, 24">
      <Path
        d="M11 8 h26 a7 7 0 0 1 7 7 v13 a7 7 0 0 1 -7 7 h-3 v7 l-9 -7 h-14 a7 7 0 0 1 -7 -7 v-13 a7 7 0 0 1 7 -7 z"
        fill={LILAC}
        stroke={INK}
        strokeWidth={SW}
        strokeLinejoin="round"
      />
      <Path d="M19.5 17 a4.5 4.5 0 1 1 6.5 4 c-1.6 0.9 -2 1.8 -2 3.2" stroke={INK} strokeWidth={SW * 1.1} fill="none" strokeLinecap="round" />
      <Circle cx={24} cy={29} r={1.8} fill={INK} />
    </G>
  );
}

function Sprout() {
  return (
    <G>
      <Path d="M8 42 q16 -9 32 0 z" fill="#E7C9A4" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M24 39 C24 31 24 26 25 20" stroke={INK} strokeWidth={SW} fill="none" strokeLinecap="round" />
      <Path d="M24.5 23 C16 24 11 18 10 11 C18 10 24 15 24.5 23 z" fill={MINT} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M25.5 20 C27 12 33 8 40 9 C40 17 34 21 25.5 20 z" fill={MINT} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      {sparkle(39, 30, 3.5, YELLOW, 's')}
    </G>
  );
}

function Cap() {
  return (
    <G rotation={-6} origin="24, 24">
      <Path d="M13 24 v8 q11 7 22 0 v-8" fill={LILAC} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M4 19 L24 10 L44 19 L24 28 Z" fill={colors.primary} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M24 19 L38 23 L38 33" stroke={YELLOW} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={38} cy={35} r={2.8} fill={YELLOW} stroke={INK} strokeWidth={SW * 0.6} />
      <Circle cx={24} cy={19} r={1.8} fill={YELLOW} stroke={INK} strokeWidth={SW * 0.5} />
    </G>
  );
}

function Megaphone() {
  // "What's happening" — a little announcement horn with sound waves.
  return (
    <G rotation={-10} origin="24, 24">
      {capsuleInk(15, 31, 18, 39, 5, 'hi')}
      {capsuleFill(15, 31, 18, 39, 5, LILAC, 'hf')}
      <Path d="M8 19 L30 9 V37 L8 27 Z" fill={PINK} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <Rect x={4} y={18} width={7} height={10} rx={2.5} fill={YELLOW} stroke={INK} strokeWidth={SW} />
      <Rect x={29} y={8} width={5} height={30} rx={2.5} fill={LILAC} stroke={INK} strokeWidth={SW} />
      <Path d="M38 17 q3 6 0 12" stroke={INK} strokeWidth={SW} fill="none" strokeLinecap="round" />
      <Path d="M42 13 q5 10 0 20" stroke={INK} strokeWidth={SW} fill="none" strokeLinecap="round" />
    </G>
  );
}

const ICONS: Record<NSIconName, () => React.JSX.Element> = {
  megaphone: Megaphone,
  bookmark: Bookmark,
  search: Search,
  trophy: Trophy,
  backpack: Backpack,
  sparkles: Sparkles,
  ask: Ask,
  sprout: Sprout,
  cap: Cap,
  wave: Wave,
  help: Help,
  chat: Chat,
  thanks: Thanks,
  party: Party,
  school: School,
  steps: Steps,
  star: Star,
};

// Achievement keys (achievements_schema.sql) drawn with our own icons;
// anything new or unknown falls back to the emoji stored in the database.
const ACHIEVEMENT_ICONS: Record<string, NSIconName> = {
  first_helper: 'help',
  helpful_student: 'star',
  community_builder: 'trophy',
  community_voice: 'chat',
  supporter: 'thanks',
};

export function achievementIcon(key: string): NSIconName | null {
  return ACHIEVEMENT_ICONS[key] ?? null;
}

export default function NSIcon({ name, size = 24 }: Props) {
  const Icon = ICONS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Icon />
    </Svg>
  );
}
