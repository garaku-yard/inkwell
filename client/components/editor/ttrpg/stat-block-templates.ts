/**
 * Stat-block presets for TabletopRPG projects. These are plain-text
 * templates dropped into a `stat_block` element when the user picks
 * one from the loader dialog. Format matches Inkwell's existing
 * monospace stat-block rendering — newline-separated lines, with the
 * first line treated visually as a name.
 *
 * Conventions kept across systems:
 *   - first line = creature/NPC name (writers usually replace this)
 *   - second line = high-level meta (CR/level/role/source)
 *   - subsequent lines fall back to whatever the system requires
 *
 * Adding a system: append a new entry to STAT_BLOCK_TEMPLATES with a
 * stable id, a friendly label, a one-line description, and the body.
 */

export interface StatBlockTemplate {
  id: string
  label: string
  description: string
  body: string
}

export const STAT_BLOCK_TEMPLATES: StatBlockTemplate[] = [
  {
    id: "dnd5e",
    label: "D&D 5e",
    description: "Classic Wizards of the Coast layout — AC, HP, speed, six abilities, traits + actions.",
    body: [
      "Goblin",
      "Small humanoid (goblinoid), neutral evil — CR 1/4",
      "AC 15 (leather, shield) | HP 7 (2d6) | Speed 30ft",
      "STR 8 (-1) | DEX 14 (+2) | CON 10 (+0) | INT 10 (+0) | WIS 8 (-1) | CHA 8 (-1)",
      "Skills Stealth +6 · Senses Darkvision 60ft, passive Perception 9 · Languages Common, Goblin",
      "",
      "Traits",
      "Nimble Escape — The goblin can take Disengage or Hide as a bonus action on each of its turns.",
      "",
      "Actions",
      "Scimitar — Melee weapon attack: +4 to hit, reach 5ft, one target. Hit: 5 (1d6+2) slashing.",
      "Shortbow — Ranged weapon attack: +4 to hit, range 80/320ft, one target. Hit: 5 (1d6+2) piercing.",
    ].join("\n"),
  },
  {
    id: "pf2",
    label: "Pathfinder 2e",
    description: "Paizo three-action layout — perception/skills bar, defenses, offenses, traits.",
    body: [
      "Goblin Warrior",
      "Creature 1 — Uncommon · CE · Small · Goblin · Humanoid",
      "Perception +5; darkvision",
      "Languages Goblin",
      "Skills Athletics +5, Stealth +5",
      "Str +3, Dex +3, Con +1, Int -1, Wis +0, Cha +0",
      "AC 16; Fort +5, Ref +7, Will +2",
      "HP 6",
      "Speed 25 feet",
      "",
      "Melee ◆ Dogslicer +7 (Agile, Backstabber, Finesse), Damage 1d6+3 slashing",
      "Ranged ◆ Shortbow +7 (Deadly d10, Range 60 feet), Damage 1d6 piercing",
    ].join("\n"),
  },
  {
    id: "osr",
    label: "OSR / B/X",
    description: "Old-School Renaissance shorthand — armor class descending, single morale + treasure line.",
    body: [
      "Goblin",
      "AC 6 [13] | HD 1-1 | HP 3 | #AT 1 | DMG 1d6 (weapon)",
      "MV 60' (20') | SV F1 | ML 7 | AL Chaotic | XP 5",
      "Treasure (R) | Numbers: 4d4 (lair 6d10)",
      "",
      "Notes",
      "—",
    ].join("\n"),
  },
  {
    id: "fate",
    label: "Fate Core",
    description: "Aspects + skills + stunts + stress/consequences track.",
    body: [
      "The Goblin Scout",
      "High Concept: Wiry Goblin Tracker",
      "Trouble: Cowardly when cornered",
      "Other Aspects: Knows every shortcut · Owes a debt to the warlord",
      "",
      "Skills",
      "+3 Stealth",
      "+2 Notice · Athletics",
      "+1 Shoot · Provoke · Lore",
      "",
      "Stunts",
      "Vanish — Spend a fate point to take Stealth as a free action when in dim light.",
      "",
      "Stress: ☐☐",
      "Consequences: 2 / 4 / 6",
    ].join("\n"),
  },
  {
    id: "generic",
    label: "Generic",
    description: "System-agnostic skeleton with the slots most stat blocks share.",
    body: [
      "Name",
      "Role | Level/CR | Disposition",
      "Defenses: —",
      "Health: —",
      "Speed: —",
      "Attributes: —",
      "",
      "Abilities",
      "—",
      "",
      "Actions",
      "—",
      "",
      "Notes",
      "—",
    ].join("\n"),
  },
]
