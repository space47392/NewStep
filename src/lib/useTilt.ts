import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { Accelerometer } from 'expo-sensors';

// How far the phone is tilted from where it was held when the screen
// opened, smoothed and clamped to −1…1 on each axis. Drives the School Sky
// parallax: far layers barely move, near layers move more, which reads as
// depth — like looking at the sky through a window.
export function useTilt() {
  const x = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    let base: { x: number; y: number } | null = null;
    let sx = 0;
    let sy = 0;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));

    Accelerometer.isAvailableAsync()
      .then((ok) => {
        if (!ok || cancelled) return;
        Accelerometer.setUpdateInterval(50);
        sub = Accelerometer.addListener(({ x: ax, y: ay }) => {
          if (!base) base = { x: ax, y: ay };
          // Low-pass so hand jitter doesn't shake the sky.
          sx = sx * 0.85 + (ax - base.x) * 0.15;
          sy = sy * 0.85 + (ay - base.y) * 0.15;
          x.setValue(clamp(sx * 2.2));
          y.setValue(clamp(sy * 2.2));
        });
      })
      .catch(() => {
        // No sensor (or not allowed): the sky just stays still.
      });

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [x, y]);

  return { x, y };
}

export type Tilt = ReturnType<typeof useTilt>;

// translateX/translateY for a layer at a given depth (px of travel at full tilt).
export function tiltTransform(tilt: Tilt | undefined, depth: number) {
  if (!tilt) return [];
  return [
    { translateX: tilt.x.interpolate({ inputRange: [-1, 1], outputRange: [depth, -depth] }) },
    { translateY: tilt.y.interpolate({ inputRange: [-1, 1], outputRange: [-depth * 0.6, depth * 0.6] }) },
  ];
}
