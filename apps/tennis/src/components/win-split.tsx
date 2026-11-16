// Split win-probability bar: player 1's share from the left (def colour), player 2's from the
// right (off colour), with a short "net" tick at 50%. Same idea as D1 Hoops' WinProb block.
export const P1 = "var(--def)";
export const P2 = "var(--off)";

export default function WinSplit({ p1, p2, labels, p1Name, p2Name, quiet = false, thick = false }: {
  p1: number | null; p2: number | null; labels: [string, string]; p1Name: string; p2Name: string; quiet?: boolean; thick?: boolean;
}) {
  const h = thick ? "h-2.5" : "h-1.5";
  if (p1 === null && p2 === null) return <div className={`${h} rounded-full bg-line`} role="img" aria-label="No probability yet" />;
  const a = p1 ?? 1 - (p2 as number);
  return (
    <div role="img" aria-label={`Win probability: ${p1Name} ${labels[0]}, ${p2Name} ${labels[1]}`} className="relative">
      <div className={`flex ${h} gap-[2px] ${quiet ? "opacity-40 saturate-50" : ""}`}>
        <div className="rounded-l-full" style={{ width: `${a * 100}%`, background: P1 }} />
        <div className="flex-1 rounded-r-full" style={{ background: P2 }} />
      </div>
      <span aria-hidden className="absolute -bottom-[3px] -top-[3px] left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-ink opacity-50" />
    </div>
  );
}
