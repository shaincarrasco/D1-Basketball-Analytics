// Tiny haptic taps for Android phones (navigator.vibrate). iPhones ignore it: Safari gives websites
// no vibration API. Off when the reader asks for reduced motion. Never throws.
type Kind = "tick" | "select" | "success";
const PATTERN: Record<Kind, number | number[]> = { tick: 6, select: 10, success: [10, 40, 14] };

export function haptic(kind: Kind = "tick") {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate(PATTERN[kind]);
  } catch {
    /* unsupported or blocked */
  }
}
