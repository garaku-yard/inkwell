export const CATEGORY_COLORS: Record<string, { bg: string; ring: string }> = {
  screenplay:          { bg: "#1e1b4b", ring: "#818cf8" },
  novel:               { bg: "#1c1007", ring: "#fb923c" },
  comic_script:        { bg: "#1a1200", ring: "#facc15" },
  poetry:              { bg: "#1e0a2e", ring: "#c084fc" },
  interactive_fiction: { bg: "#031a1f", ring: "#22d3ee" },
  tabletop_rpg:        { bg: "#1f0505", ring: "#f87171" },
  memoir:              { bg: "#071811", ring: "#4ade80" },
  lyrics:              { bg: "#1f0718", ring: "#f472b6" },
}

interface CategoryIconProps {
  slug: string
  size?: number
  rounded?: number
}

export function CategoryIcon({ slug, size = 40, rounded = 14 }: CategoryIconProps) {
  const colors = CATEGORY_COLORS[slug] ?? { bg: "#1e293b", ring: "#94a3b8" }
  const c = colors.ring

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ borderRadius: rounded, display: "block", flexShrink: 0 }}
    >
      <rect width="40" height="40" rx={rounded} fill={colors.bg} />

      {slug === "screenplay" && (
        // Clapperboard: rect body + top bar with angled clapper
        <g stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="10" y="17" width="20" height="14" rx="1.5" />
          <line x1="10" y1="22" x2="30" y2="22" />
          <line x1="14" y1="17" x2="17" y2="11" />
          <line x1="20" y1="17" x2="23" y2="11" />
        </g>
      )}

      {slug === "novel" && (
        // Open book: two pages meeting at spine
        <g stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 28 C20 28 13 25 10 26 L10 13 C13 12 20 15 20 15" />
          <path d="M20 28 C20 28 27 25 30 26 L30 13 C27 12 20 15 20 15" />
          <line x1="20" y1="15" x2="20" y2="28" />
        </g>
      )}

      {slug === "comic_script" && (
        // Speech bubble
        <g stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13 L10 26 Q10 28 12 28 L18 28 L15 33 L22 28 L28 28 Q30 28 30 26 L30 13 Q30 11 28 11 L12 11 Q10 11 10 13 Z" />
        </g>
      )}

      {slug === "poetry" && (
        // Quill: diagonal stroke with curved tip and nib
        <g stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M28 10 C32 12 30 22 20 30" />
          <path d="M28 10 C24 10 18 16 20 30" />
          <line x1="20" y1="30" x2="16" y2="34" />
          <path d="M16 34 C17 31 19 30 20 30" />
        </g>
      )}

      {slug === "interactive_fiction" && (
        // Branch: single line splitting into two
        <g stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="20" y1="10" x2="20" y2="19" />
          <line x1="20" y1="19" x2="13" y2="27" />
          <line x1="20" y1="19" x2="27" y2="27" />
          <circle cx="20" cy="10" r="2" fill={c} stroke="none" />
          <circle cx="13" cy="30" r="2" fill={c} stroke="none" />
          <circle cx="27" cy="30" r="2" fill={c} stroke="none" />
        </g>
      )}

      {slug === "tabletop_rpg" && (
        // D6 dice in perspective
        <g stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 9 L29 14 L29 26 L20 31 L11 26 L11 14 Z" />
          <line x1="20" y1="9" x2="20" y2="31" />
          <line x1="11" y1="14" x2="29" y2="14" />
          <line x1="11" y1="26" x2="29" y2="26" />
        </g>
      )}

      {slug === "memoir" && (
        // Person silhouette: circle head + shoulders arc
        <g stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="20" cy="16" r="5" />
          <path d="M10 32 C10 25 30 25 30 32" />
        </g>
      )}

      {slug === "lyrics" && (
        // Music note: stem + flag + filled head
        <g stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="11" x2="22" y2="28" />
          <path d="M22 11 C26 12 27 17 24 19" />
          <ellipse cx="19" cy="28" rx="4" ry="2.5" transform="rotate(-15 19 28)" stroke={c} strokeWidth="1.8" />
        </g>
      )}

      {!Object.keys(CATEGORY_COLORS).includes(slug) && (
        <rect x="13" y="13" width="14" height="14" rx="2" stroke={c} strokeWidth="1.8" />
      )}
    </svg>
  )
}
