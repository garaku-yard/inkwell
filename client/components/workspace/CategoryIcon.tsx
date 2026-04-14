import { Clapperboard, BookOpen, MessageSquare, Feather, GitBranch, Dices, User, Music, PenLine } from "lucide-react"
import type { LucideIcon } from "lucide-react"

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

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  screenplay:          Clapperboard,
  novel:               BookOpen,
  comic_script:        MessageSquare,
  poetry:              Feather,
  interactive_fiction: GitBranch,
  tabletop_rpg:        Dices,
  memoir:              User,
  lyrics:              Music,
}

interface CategoryIconProps {
  slug: string
  size?: number
  rounded?: number
}

export function CategoryIcon({ slug, size = 40 }: CategoryIconProps) {
  const colors = CATEGORY_COLORS[slug] ?? { bg: "#1e293b", ring: "#94a3b8" }
  const Icon = CATEGORY_ICONS[slug] ?? PenLine

  return (
    <Icon
      style={{ color: colors.ring, width: size * 0.5, height: size * 0.5, flexShrink: 0 }}
      strokeWidth={1.8}
    />
  )
}
