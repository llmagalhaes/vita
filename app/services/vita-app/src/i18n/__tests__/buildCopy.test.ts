/**
 * APP-119 — criterion 13: no interface string in the v4.2 builders names the
 * machine. AI appears as a FUNCTION, never as a character — no persona, no
 * chat, no "Vita thinks…", no sparkle, and the word itself never on screen.
 * The one place attribution belongs is next to the number ("estimates from a
 * food database"), which is exactly what `build.plan.review.legend` says.
 */
import en from "../locales/en.json";

const strings = (node: unknown, path = "build"): [string, string][] =>
  typeof node === "string"
    ? [[path, node]]
    : Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => strings(v, `${path}.${k}`));

const BUILD = strings(en.build);

const FORBIDDEN: [label: string, re: RegExp][] = [
  ["the acronym AI", /\bAI\b/],
  ["the acronym IA", /\bIA\b/],
  ["assistant", /assistant/i],
  ["a persona speaking", /vita\s+(thinks|acha|says|suggests)/i],
  ["an emoji", /\p{Extended_Pictographic}/u],
];

test("the build.* subtree carries no machine persona and no emoji", () => {
  expect(BUILD.length).toBeGreaterThan(60);
  for (const [label, re] of FORBIDDEN) {
    const offenders = BUILD.filter(([, value]) => re.test(value)).map(([path, value]) => `${path}: ${value}`);
    expect({ [label]: offenders }).toEqual({ [label]: [] });
  }
});

test("no judgement, target or score language in the training builder", () => {
  const offenders = strings(en.build.program, "build.program").filter(([, v]) =>
    /\b(goal|target|score|streak|unbalanced|imbalanc|you should|recommend)\b/i.test(v),
  );
  expect(offenders).toEqual([]);
});
