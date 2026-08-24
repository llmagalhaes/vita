/**
 * APP-117 — criterion 22: the builder's map drops the FRONT/BACK captions
 * (illegible at 122px wide) and tightens the viewBox; Trends keeps them. Plus
 * the `fill` override the builder paints its two-source coverage with.
 */
import { render } from "@testing-library/react-native";
import "../../i18n";
import { BodyMap } from "../BodyMap";

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown };

/** Flatten the rendered host tree — react-native-svg captions are RNSVGText hosts. */
const nodes = (n: unknown): Node[] =>
  !n || typeof n !== "object"
    ? []
    : [n as Node, ...(((n as Node).children as unknown[]) ?? []).flatMap(nodes)];

test("captions on by default, off for the builder — which also tightens the viewBox", async () => {
  const view = await render(<BodyMap intensities={{ qu: 1 }} />);
  const shown = nodes(view.toJSON());
  expect(shown.filter((n) => n.type === "RNSVGText")).toHaveLength(2);
  expect(shown.find((n) => n.type === "RNSVGSvgView")?.props?.vbHeight).toBe(150);

  await view.rerender(<BodyMap intensities={{ qu: 1 }} labels={false} />);
  const bare = nodes(view.toJSON());
  expect(bare.filter((n) => n.type === "RNSVGText")).toHaveLength(0);
  expect(bare.find((n) => n.type === "RNSVGSvgView")?.props?.vbHeight).toBe(134);
});

test("`fill` replaces the intensity ramp on every capsule", async () => {
  const view = await render(<BodyMap intensities={{}} labels={false} fill={() => "#123456"} />);
  // react-native-svg processes colours into ARGB ints by the time they hit the host.
  const painted = nodes(view.toJSON()).filter(
    (n) => (n.props?.fill as { payload?: number })?.payload === 0xff123456,
  );
  expect(painted.length).toBeGreaterThan(10); // every muscle capsule, none left neutral
});
