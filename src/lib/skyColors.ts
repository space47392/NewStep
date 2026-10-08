import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { decode } from 'jpeg-js';

// "Painted sky": the School Sky background is recoloured from the colours
// in classmates' real sky photos, not by showing the photos themselves.
//
// Each photo is shrunk to a 6×9 thumbnail and read as three bands of sky —
// top, middle and lower — skipping the bottom rows, where buildings and
// trees usually are. Those three colours are stored with the star.

export type SkyPalette = [string, string, string];

type RGB = [number, number, number];

const toHex = ([r, g, b]: RGB) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string): RGB => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export async function extractSkyPalette(localUri: string): Promise<SkyPalette> {
  const rendered = await ImageManipulator.manipulate(localUri).resize({ width: 6, height: 9 }).renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 1 });
  const bytes = await new File(saved.uri).bytes();
  const img = decode(bytes, { useTArray: true, formatAsRGBA: true });

  const bandAverage = (rowStart: number, rowEnd: number): RGB => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = rowStart; y < Math.min(rowEnd, img.height); y++) {
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        r += img.data[i];
        g += img.data[i + 1];
        b += img.data[i + 2];
        n++;
      }
    }
    return n ? [r / n, g / n, b / n] : [28, 23, 82];
  };

  return [toHex(bandAverage(0, 3)), toHex(bandAverage(3, 5)), toHex(bandAverage(5, 7))];
}

// Photos are often dull (grey clouds, an indoor shot, a hazy noon), and a
// straight average of them turns muddy. Each colour gets its saturation and
// lightness nudged into a range that reads as "sky light".
function liven([r, g, b]: RGB): RGB {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  let s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  s = Math.min(0.85, Math.max(0.35, s * 1.5));
  const L = Math.min(0.62, Math.max(0.35, l));
  const c = (1 - Math.abs(2 * L - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - c / 2;
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

// Today's photo palettes, averaged band by band and livened up. The sky
// scene only tints with these (see SkyScene) — it never paints them on raw.
export function paintSky(palettes: SkyPalette[]): SkyPalette | null {
  if (palettes.length === 0) return null;
  const bands = [0, 1, 2].map((band) => {
    const avg = palettes
      .map((p) => fromHex(p[band]))
      .reduce<RGB>((acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]], [0, 0, 0])
      .map((v) => v / palettes.length) as RGB;
    return toHex(liven(avg));
  });
  return bands as SkyPalette;
}

// a → b by t (0–1), for hex colours.
export function mixHex(a: string, b: string, t: number): string {
  return toHex(mix(fromHex(a), fromHex(b), t));
}

// Perceived brightness (0–1) of a colour, to dim the star field on a
// bright painted sky.
export function brightness(hex: string): number {
  const [r, g, b] = fromHex(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
