"use client";
// A number whose digits roll like an odometer when the value changes (a live score ticking up,
// a rank moving). The first render is static, so server HTML and the first paint match.
// Inspired by Componentry's Text Morph (MIT, Harsh Jadhav, https://componentry.dev), reduced to
// digit columns that slide with transform only, which stays smooth on phones.
import { useEffect, useState } from "react";

type Props = { value: number | string | null | undefined; className?: string; /** ms */ duration?: number };

const DIGITS = "0123456789";

function Column({ digit, animate, duration }: { digit: number; animate: boolean; duration: number }) {
  return (
    <span className="rn-col" aria-hidden>
      <span className="rn-strip" style={{ transform: `translateY(${-digit * 10}%)`, transition: animate ? `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)` : "none" }}>
        {DIGITS.split("").map(d => <span key={d}>{d}</span>)}
      </span>
    </span>
  );
}

export default function RollingNumber({ value, className, duration = 650 }: Props) {
  const text = value == null ? "" : String(value);
  // Armed once after mount: the first paint is static (matches the server), and every later change rolls.
  const [animate, setAnimate] = useState(false);
  useEffect(() => { setAnimate(!window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);
  // Right-align the columns so "9" -> "10" adds a column on the left and the ones digit rolls.
  return (
    <span className={`rn ${className ?? ""}`}>
      <span className="sr-only">{text}</span>
      {text.split("").map((ch, i) => {
        const key = text.length - i;
        return /\d/.test(ch)
          ? <Column key={key} digit={Number(ch)} animate={animate} duration={duration} />
          : <span key={key} aria-hidden>{ch}</span>;
      })}
    </span>
  );
}
