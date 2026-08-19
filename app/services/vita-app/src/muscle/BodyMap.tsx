/**
 * APP-101 — the v4 capsule body: FRONT (x≈48) and BACK (x≈142) side by side in one
 * `viewBox 0 0 190 150`, built from the handoff's exact primitive list (README §3,
 * prototype lines 632–664). Every coordinate here is verbatim from the prototype SVG —
 * treat it as data, not as layout to "improve".
 *
 * Neutral parts (head, neck, pelvis, shins, feet-less legs) never tint. `max-width`
 * 250 on the workout card, 240 on Trends, 225 on a past day — pass it in.
 *
 * Memoised: the fills only change when `intensities` or the accent does, and this SVG
 * sits inside cards that re-render on every scrub/tick.
 */
import { memo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Rect, Text as SvgText } from "react-native-svg";
import { useAccent, colors, fonts } from "../ui";
import { muF, type Intensities } from "./muscleData";

const NEUTRAL = colors.muscleEmptyAlt; // #EDE6D8 — head/neck/pelvis/shins

export const BodyMap = memo(function BodyMap({
  intensities,
  maxWidth = 250,
}: {
  intensities: Intensities;
  /** SVG max width in px — 250 workout card · 240 Trends · 225 past day. */
  maxWidth?: number;
}) {
  const { t } = useTranslation();
  const accent = useAccent();
  const f = (k: keyof Intensities) => muF(intensities[k] ?? 0, accent);
  const [qu, gl, ha, ca, ch, bk, sh, ar, tr, co] = (["qu", "gl", "ha", "ca", "ch", "bk", "sh", "ar", "tr", "co"] as const).map(f);
  return (
    <View style={{ width: "100%", maxWidth, alignSelf: "center", aspectRatio: 190 / 150 }}>
      <Svg width="100%" height="100%" viewBox="0 0 190 150">
        {/* ── FRONT ─────────────────────────────────────────────────────────── */}
        <Circle cx={48} cy={11} r={8} fill={NEUTRAL} />
        <Rect x={44} y={18} width={8} height={6} rx={3} fill={NEUTRAL} />
        <Circle cx={30} cy={28} r={7} fill={sh} />
        <Circle cx={66} cy={28} r={7} fill={sh} />
        <Rect x={33} y={23} width={14} height={16} rx={6} fill={ch} />
        <Rect x={49} y={23} width={14} height={16} rx={6} fill={ch} />
        <Rect x={19} y={33} width={9} height={21} rx={4.5} fill={ar} />
        <Rect x={68} y={33} width={9} height={21} rx={4.5} fill={ar} />
        <Rect x={16} y={56} width={8} height={17} rx={4} fill={ar} />
        <Rect x={72} y={56} width={8} height={17} rx={4} fill={ar} />
        <Rect x={38} y={41} width={20} height={19} rx={7} fill={co} />
        <Rect x={36} y={62} width={24} height={10} rx={5} fill={NEUTRAL} />
        <Rect x={36} y={74} width={11} height={30} rx={5.5} fill={qu} />
        <Rect x={49} y={74} width={11} height={30} rx={5.5} fill={qu} />
        <Rect x={38} y={107} width={8} height={23} rx={4} fill={NEUTRAL} />
        <Rect x={50} y={107} width={8} height={23} rx={4} fill={NEUTRAL} />
        {/* ── BACK ──────────────────────────────────────────────────────────── */}
        <Circle cx={142} cy={11} r={8} fill={NEUTRAL} />
        <Rect x={133} y={19} width={18} height={9} rx={4} fill={tr} />
        <Circle cx={124} cy={28} r={7} fill={sh} />
        <Circle cx={160} cy={28} r={7} fill={sh} />
        <Rect x={127} y={30} width={14} height={20} rx={6} fill={bk} />
        <Rect x={143} y={30} width={14} height={20} rx={6} fill={bk} />
        <Rect x={113} y={33} width={9} height={21} rx={4.5} fill={ar} />
        <Rect x={162} y={33} width={9} height={21} rx={4.5} fill={ar} />
        <Rect x={110} y={56} width={8} height={17} rx={4} fill={ar} />
        <Rect x={166} y={56} width={8} height={17} rx={4} fill={ar} />
        <Rect x={135} y={52} width={14} height={9} rx={4} fill={NEUTRAL} />
        <Rect x={130} y={63} width={12} height={13} rx={6} fill={gl} />
        <Rect x={143} y={63} width={12} height={13} rx={6} fill={gl} />
        <Rect x={130} y={78} width={11} height={26} rx={5.5} fill={ha} />
        <Rect x={144} y={78} width={11} height={26} rx={5.5} fill={ha} />
        <Rect x={131} y={106} width={9} height={22} rx={4.5} fill={ca} />
        <Rect x={145} y={106} width={9} height={22} rx={4.5} fill={ca} />
        {/* ── Captions ──────────────────────────────────────────────────────── */}
        <SvgText x={48} y={146} textAnchor="middle" fontSize={8} fontWeight="700" fill={colors.faint} fontFamily={fonts.bold}>
          {t("muscle.front")}
        </SvgText>
        <SvgText x={142} y={146} textAnchor="middle" fontSize={8} fontWeight="700" fill={colors.faint} fontFamily={fonts.bold}>
          {t("muscle.back")}
        </SvgText>
      </Svg>
    </View>
  );
});
