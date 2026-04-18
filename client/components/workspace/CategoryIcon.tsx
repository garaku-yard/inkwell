import { Clapperboard, BookOpen, MessageSquare, Feather, GitBranch, Dices, User, Music, PenLine } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export const CATEGORY_COLORS: Record<string, { bg: string; ring: string }> = {
  screenplay:          { bg: "#1e1b4b", ring: "#6b6fc4" },
  novel:               { bg: "#1c1007", ring: "#c47a45" },
  comic_script:        { bg: "#1a1200", ring: "#b09a35" },
  poetry:              { bg: "#1e0a2e", ring: "#9d6bbf" },
  interactive_fiction: { bg: "#031a1f", ring: "#2ea0b0" },
  tabletop_rpg:        { bg: "#1f0505", ring: "#bf5555" },
  memoir:              { bg: "#071811", ring: "#3d9966" },
  lyrics:              { bg: "#1f0718", ring: "#bf5590" },
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
