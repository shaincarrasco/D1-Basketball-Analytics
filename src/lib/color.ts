// Small colour helpers for team colours (ESPN hex strings).
const HEX = /^#?[0-9a-f]{6}$/i;

export function luminance(hex: string | null | undefined) {
  if (!hex || !HEX.test(hex)) return null;
  const n = parseInt(hex.replace("#", ""), 16);
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
/** Text colour that reads on a team-colour background. */
export const onTeam = (hex: string | null | undefined) => ((luminance(hex) ?? 0) > 0.4 ? "#111418" : "#ffffff");
/** Team colour normalised to "#rrggbb", or null. */
export const teamHex = (hex: string | null | undefined) => (hex && HEX.test(hex) ? `#${hex.replace("#", "")}` : null);
