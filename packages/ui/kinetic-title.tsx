// Word-by-word title reveal: each word rises a few pixels out of a soft blur, one after another.
// Adapted from Componentry's Kinetic Text Reveal (MIT, Harsh Jadhav, https://componentry.dev),
// rewritten as pure CSS so the title is in the HTML from the first byte and needs no JavaScript.
// The animation lives in theme.css (.kt-word) and is switched off for reduced motion.
import { Fragment } from "react";

type Props = { text: string; className?: string; as?: "h1" | "h2" | "span"; stagger?: number; delay?: number };

export default function KineticTitle({ text, className, as: Tag = "h1", stagger = 55, delay = 0 }: Props) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <Tag className={className}>
      <span className="sr-only">{text}</span>
      {words.map((w, i) => (
        <Fragment key={i}>
          <span aria-hidden className="kt-mask">
            <span className="kt-word" style={{ animationDelay: `${delay + i * stagger}ms` }}>{w}</span>
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </Tag>
  );
}
