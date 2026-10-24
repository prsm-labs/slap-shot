// 2026-10-24 light mode: true when the device is in light mode (for hex colors that get alpha suffixes and can't be CSS vars)
export const isLight = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: light)").matches;
