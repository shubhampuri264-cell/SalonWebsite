interface IrisMarkProps {
  /** Rendered size in pixels. 24 for the message avatar, 28 in the launcher. */
  size?: number;
  className?: string;
}

/**
 * The Iris brand mark.
 *
 * Inline SVG on purpose: no new dependency, no new asset to 404 on a deploy,
 * no request on first paint, and it inherits currentColor-free brand values
 * directly. A rose disc with a gold hairline ring, a lowercase serif "i" in the
 * site's cream, and a small gold sparkle — the same rose/gold/Fraunces language
 * as the rest of the site, so Iris reads as part of the salon rather than a
 * bolted-on chat product.
 *
 * aria-hidden throughout: the name "Iris" is always present as real text
 * beside it, and a screen reader announcing a decorative glyph twice is noise.
 */
export default function IrisMark({ size = 24, className }: IrisMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="16" cy="16" r="15" fill="#C9757A" />
      <circle cx="16" cy="16" r="15" stroke="#B8902A" strokeWidth="1" />
      {/* Lowercase serif "i" — Fraunces if the page has it, Georgia otherwise. */}
      <text
        x="16"
        y="23"
        textAnchor="middle"
        fill="#FBF6F2"
        fontFamily="Fraunces, Georgia, serif"
        fontSize="19"
        fontWeight="600"
      >
        i
      </text>
      {/* Four-point sparkle, upper right. */}
      <path
        d="M25 5.5 L25.9 8.1 L28.5 9 L25.9 9.9 L25 12.5 L24.1 9.9 L21.5 9 L24.1 8.1 Z"
        fill="#B8902A"
      />
    </svg>
  );
}
