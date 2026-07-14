import { type ReactNode, useState } from "react";
import { View } from "react-native";
import { Text, colors, fonts } from "../ui";
import { ScrubOverlay } from "./scrub";

export const SectionLabel = ({ children }: { children: string }) => (
  <Text
    variant="caption"
    style={{ fontFamily: fonts.extraBold, fontSize: 11.5, letterSpacing: 1.2, textTransform: "uppercase" }}
    color={colors.labelMuted}
  >
    {children}
  </Text>
);

/** Build an SVG polyline path across evenly-spaced x with y scaled to [0,max]. */
export function linePath(values: number[], w: number, h: number, pad = 6): string {
  if (values.length === 0) return "";
  const max = Math.max(1, ...values);
  const step = values.length === 1 ? 0 : (w - pad * 2) / (values.length - 1);
  return values
    .map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - (v / max) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * A Trends card: uppercase title + optional unit note + a right-hand extra
 * (e.g. a bars/curve toggle). If `count` is given the body is scrub-draggable —
 * a readout line appears while dragging and the active index is handed to
 * `children` so bars can highlight/dim. Calm, estimate-labeled where relevant.
 */
export function TrendCard({
  title,
  unitNote,
  extra,
  count,
  readout,
  footer,
  children,
  dragHint,
}: {
  title: string;
  unitNote?: string;
  extra?: ReactNode;
  count?: number;
  readout?: (index: number) => { value: string; detail: string };
  footer?: string;
  dragHint?: string;
  children: (active: number | null) => ReactNode;
}) {
  const [active, setActive] = useState<number | null>(null);
  const read = active != null && readout ? readout(active) : null;

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 24,
        padding: 18,
        borderWidth: 1,
        borderColor: "rgba(120,100,75,0.06)",
        gap: 12,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <SectionLabel>{title}</SectionLabel>
        {extra ?? (unitNote ? (
          <Text variant="caption" style={{ fontSize: 10.5 }} color={colors.labelMuted}>
            {unitNote}
          </Text>
        ) : null)}
      </View>

      {read && (
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 7, marginTop: -2 }}>
          <Text style={{ fontFamily: fonts.light, fontSize: 22, letterSpacing: -0.5 }}>{read.value}</Text>
          <Text variant="caption" style={{ fontSize: 11.5 }} color={colors.muted}>
            {read.detail}
          </Text>
          {dragHint && (
            <Text variant="caption" style={{ fontSize: 10, marginLeft: "auto" }} color={colors.labelMuted}>
              {dragHint}
            </Text>
          )}
        </View>
      )}

      <View style={{ position: "relative" }}>
        {children(active)}
        {count != null && count > 0 && (
          <ScrubOverlay count={count} onScrub={setActive} onEnd={() => setActive(null)} accessibilityLabel={title} />
        )}
      </View>

      {footer && (
        <Text variant="caption" style={{ fontSize: 11 }} color={colors.muted}>
          {footer}
        </Text>
      )}
    </View>
  );
}
