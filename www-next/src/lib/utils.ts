// Formatting utilities for the StarNav UI

/** Format coordinate to 6 decimal places, or '--' if null/undefined */
export function fmtCoord(v: number | null | undefined): string {
  return v != null ? v.toFixed(6) : "--";
}

/** Format altitude as '123.4 m', or '--' if null/undefined */
export function fmtAlt(v: number | null | undefined): string {
  return v != null ? `${v.toFixed(1)} m` : "--";
}

/** Format degrees as '12.3deg', or '--' if null/undefined */
export function fmtDeg(v: number | null | undefined): string {
  return v != null ? `${v.toFixed(1)}\u00B0` : "--";
}

/** Format metres with configurable decimal digits, or '--' if null/undefined */
export function fmtM(v: number | null | undefined, digits = 2): string {
  return v != null ? `${v.toFixed(digits)} m` : "--";
}

/** Combine class names, filtering out falsy values */
export function cn(
  ...classes: (string | false | null | undefined)[]
): string {
  return classes.filter(Boolean).join(" ");
}
