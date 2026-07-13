import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { entryPalette } from "./tokens";

/** Organic wave footer for timeline/detail cards — paths from the prototype. */
export function WaveIllustration({
  kind,
  height = 72,
}: {
  kind: keyof typeof entryPalette;
  height?: number;
}) {
  const p = entryPalette[kind];
  return (
    <View pointerEvents="none" style={{ width: "100%", height }}>
      <Svg width="100%" height="100%" viewBox="0 0 348 72" preserveAspectRatio="none">
        <Circle cx={282} cy={32} r={17} fill="#F2B45C" opacity={0.45} />
        <Path
          d="M0 42 C60 22 120 54 180 38 C240 22 300 48 348 32 L348 72 L0 72 Z"
          fill={p.c1}
          opacity={0.55}
        />
        <Path
          d="M0 56 C70 40 140 64 210 50 C280 38 320 58 348 48 L348 72 L0 72 Z"
          fill={p.c2}
        />
        <Circle cx={24} cy={63} r={5} fill={p.c2} opacity={0.8} />
        <Circle cx={329} cy={65} r={6} fill={p.c1} />
        <Path
          d="M8 44 C60 16 104 58 162 42 C222 26 268 18 340 24"
          fill="none"
          stroke={p.line}
          strokeWidth={4.5}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
