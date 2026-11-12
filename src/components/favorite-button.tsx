"use client";
import { Star } from "lucide-react";
import { toggleFavorite, useFavorites } from "@/lib/favorites";

export default function FavoriteButton({ kind, id, name, compact = false }: { kind: "teams" | "players"; id: string; name: string; compact?: boolean }) {
  const fav = useFavorites()[kind].includes(id);
  const label = fav ? `Unfollow ${name}` : `Follow ${name}`;
  return (
    <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); toggleFavorite(kind, id); }} aria-pressed={fav} aria-label={label} title={label}
      className={compact ? "grid h-7 w-7 place-items-center rounded-md text-mute hover:text-ink" : "btn"}>
      <Star size={compact ? 15 : 16} aria-hidden fill={fav ? "currentColor" : "none"} className={fav ? "text-off" : ""} />
      {!compact && (fav ? "Following" : "Follow")}
    </button>
  );
}
