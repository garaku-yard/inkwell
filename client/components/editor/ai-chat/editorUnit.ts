export function editorUnitNoun(category?: string): string {
  if (category === "novel" || category === "memoir") return "chapter"
  if (category === "poetry") return "poem"
  if (category === "lyrics") return "song"
  if (category === "comic_script") return "page"
  if (category === "tabletop_rpg" || category === "ttrpg") return "section"
  if (category === "interactive_fiction") return "passage"
  return "scene"
}
