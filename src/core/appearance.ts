export const PALETTES = {
  accurate: {
    name: "Accurate",
    bg: "#0C0D0B",
    panel: "#0F100E",
    line: "#232422",
    text: "#E5E5E0",
    muted: "#7E857A",
    accent: "#FF8A1E",
    up: "#FF8A1E",
    down: "#8A8A8A",
    borderUp: "#FF8A1E",
    wickUp: "#FF8A1E",
    borderDown: "#8A8A8A",
    wickDown: "#8A8A8A",
    accentInk: "#0C0D0B",
  },
  cyber: {
    name: "Cyber Blue",
    bg: "#050816",
    panel: "#0B0F20",
    line: "#252C40",
    text: "#E8EDF5",
    muted: "#A0A6B5",
    accent: "#00D4FF",
    up: "#00D4FF",
    down: "#394150",
    borderUp: "#00D4FF",
    wickUp: "#00D4FF",
    borderDown: "#394150",
    wickDown: "#657084",
    accentInk: "#050816",
  },
  midnight: {
    name: "NTT Midnight",
    bg: "#0B1220",
    panel: "#111B2B",
    line: "#29384C",
    text: "#E5EDF7",
    muted: "#9AACC2",
    accent: "#2D9CDB",
    up: "#2D9CDB",
    down: "#1C2A3A",
    borderUp: "#2D9CDB",
    wickUp: "#2D9CDB",
    borderDown: "#35455B",
    wickDown: "#56667D",
    accentInk: "#0B1220",
  },
  phantom: {
    name: "Phantom Purple",
    bg: "#10101A",
    panel: "#181823",
    line: "#303041",
    text: "#EEEAF6",
    muted: "#AAA3BC",
    accent: "#8B5CF6",
    up: "#8B5CF6",
    down: "#404454",
    borderUp: "#8B5CF6",
    wickUp: "#8B5CF6",
    borderDown: "#404454",
    wickDown: "#6E7284",
    accentInk: "#FFFFFF",
  },
  lavender: {
    name: "Lavender",
    bg: "#F4EFFB",
    panel: "#F9F6FD",
    line: "#DFD4E8",
    text: "#2A2431",
    muted: "#74657F",
    accent: "#7A6285",
    up: "#FFFFFF",
    down: "#7A6285",
    borderUp: "#C5B4D2",
    wickUp: "#AA95B9",
    borderDown: "#7A6285",
    wickDown: "#7A6285",
    accentInk: "#FFFFFF",
  },
  claude: {
    name: "Claude",
    bg: "#1F1C19",
    panel: "#28231F",
    line: "#494038",
    text: "#F1E9DF",
    muted: "#B1A59B",
    accent: "#D38A5D",
    up: "#D38A5D",
    down: "#7E7A75",
    borderUp: "#D38A5D",
    wickUp: "#D38A5D",
    borderDown: "#7E7A75",
    wickDown: "#A29A90",
    accentInk: "#1F1C19",
  },
} as const;
export type Appearance = {
  preset: keyof typeof PALETTES;
  panelOpacity: number;
  zoneOpacity: number;
  gridOpacity: number;
  labelOpacity: number;
  minimal: boolean;
  graphOrders: boolean;
  orderColors?: { buy: string; sell: string; sl: string; tp: string };
  magnet: "off" | "weak" | "strong";
};
export const DEFAULT_APPEARANCE: Appearance = {
  preset: "accurate",
  panelOpacity: 96,
  zoneOpacity: 16,
  gridOpacity: 40,
  labelOpacity: 85,
  minimal: true,
  graphOrders: true,
  magnet: "weak",
};
export function migrateAppearance(
  value: Partial<Omit<Appearance, "preset">> & { preset?: string },
): Appearance {
  const legacy = {
    black: "cyber",
    night: "midnight",
    slate: "midnight",
    light: "lavender",
    aurum: "claude",
  } as const;
  const saved = value?.preset ?? DEFAULT_APPEARANCE.preset;
  const preset = Object.hasOwn(PALETTES, saved)
    ? (saved as Appearance["preset"])
    : Object.hasOwn(legacy, saved)
      ? legacy[saved as keyof typeof legacy]
      : DEFAULT_APPEARANCE.preset;
  return { ...DEFAULT_APPEARANCE, ...value, preset };
}
export const alpha = (hex: string, percent: number) =>
  hex +
  Math.round(Math.max(0, Math.min(100, percent)) * 2.55)
    .toString(16)
    .padStart(2, "0");
export const SHELL = {
  bg: "#080808",
  panel: "#111111",
  line: "#292929",
  text: "#D1D4DC",
  muted: "#8A8C94",
  accent: "#C2C4CC",
  ink: "#101010",
} as const;
export function appearanceShell(preset: Appearance["preset"]) {
  return preset === "accurate"
    ? {
        bg: "#0C0D0B",
        panel: "#0F100E",
        line: "#252720",
        text: "#E5E5E0",
        muted: "#92968D",
        accent: "#E6A15B",
        ink: "#0C0D0B",
      }
    : SHELL;
}
export function orderColors(light: boolean) {
  return light
    ? { buy: "#167047", sell: "#a84b06", sl: "#b52f44", tp: "#087d76" }
    : { buy: "#5dd995", sell: "#ff9b4a", sl: "#ff6f7f", tp: "#49d3c6" };
}
export function appearanceVariables(a: Appearance) {
  const p = PALETTES[a.preset];
  const shell = appearanceShell(a.preset);
  return {
    "--bg": shell.bg,
    "--panel": alpha(shell.panel, a.panelOpacity),
    "--panel-solid": shell.panel,
    "--line": shell.line,
    "--text": shell.text,
    "--muted": shell.muted,
    "--gold": shell.accent,
    "--green": shell.text,
    "--red": shell.muted,
    "--accent": shell.accent,
    "--accent-ink": shell.ink,
    "--chart-bg": p.bg,
    "--chart-accent": p.accent,
    "--chart-text": p.text,
    "--chart-muted": p.muted,
    "--label-opacity": a.labelOpacity / 100,
  };
}
