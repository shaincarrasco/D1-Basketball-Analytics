/* eslint-disable @next/next/no-img-element */
// ESPN-hosted logo with an initials fallback. ESPN publishes a dark-background
// variant at /500-dark/; both are rendered and CSS shows the one for the theme.
export default function TeamLogo({ src, name, size = 28, className = "" }: { src: string | null; name: string; size?: number; className?: string }) {
  if (!src) {
    const initials = name.split(/\s+/).map(w => w[0]).join("").slice(0, 3).toUpperCase();
    return (
      <span aria-hidden className={`inline-grid shrink-0 place-items-center rounded-full border border-line2 bg-deck2 font-display font-bold text-mute ${className}`} style={{ width: size, height: size, fontSize: size * 0.38 }}>
        {initials}
      </span>
    );
  }
  const dark = src.includes("/teamlogos/ncaa/500/") ? src.replace("/teamlogos/ncaa/500/", "/teamlogos/ncaa/500-dark/") : null;
  const style = { width: size, height: size };
  return (
    <>
      <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" className={`logo-light shrink-0 object-contain ${dark ? "has-dark" : ""} ${className}`} style={style} />
      {dark && <img src={dark} alt="" width={size} height={size} loading="lazy" decoding="async" className={`logo-dark hidden shrink-0 object-contain ${className}`} style={style} />}
    </>
  );
}
