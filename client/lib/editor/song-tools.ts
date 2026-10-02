/** Chord validation and display transposition are advisory: original notes stay stored. */
const NOTES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
const ROOT = /^([A-G])([#b]?)(.*)$/

export function transposeChord(chord: string, semitones: number): string | null {
  if (/^(?:N\.?C\.?|no\s*chord)$/i.test(chord)) return chord
  const match = ROOT.exec(chord)
  if (!match) return null
  const source = match[1] + match[2]
  const index = NOTES_SHARP.indexOf(source) >= 0 ? NOTES_SHARP.indexOf(source) : NOTES_FLAT.indexOf(source)
  if (index < 0) return null
  const shifted = (index + semitones % 12 + 12) % 12
  const notes = semitones < 0 || match[2] === "b" ? NOTES_FLAT : NOTES_SHARP
  const suffix = match[3]
  if (/\/[A-G][#b]?$/i.test(suffix)) {
    const slash = suffix.lastIndexOf("/")
    const bass = transposeChord(suffix.slice(slash + 1), semitones)
    if (!bass) return null
    return notes[shifted] + suffix.slice(0, slash + 1) + bass
  }
  if (suffix && !/^(?:m|maj|min|dim|aug|sus|add|no|ø|°|\+|-|\d|\(|\)|#|b|\/)*$/i.test(suffix)) return null
  return notes[shifted] + suffix
}

export function chordRowIssues(row: string): string[] {
  return row.trim().split(/\s+/).filter(Boolean).filter((token) => transposeChord(token, 0) === null)
}

export function transposeChordRow(row: string, semitones: number): string {
  return row.replace(/\S+/g, (chord) => transposeChord(chord, semitones) ?? chord)
}
