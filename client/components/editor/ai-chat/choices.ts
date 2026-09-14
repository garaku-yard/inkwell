export interface ChatChoice {
  key: string
  label: string
}

/** Extract explicit choices from a completed assistant reply. Lists remain
 * ordinary Markdown unless the reply also invites the reader to choose. */
export function extractChatChoices(content: string): ChatChoice[] {
  if (!/(?:choose|select|which (?:one|option|direction)|how do you want to proceed|do you\s*:|suggestions?|ideas?|directions?|options?|possibilities)/i.test(content)) {
    return []
  }

  const choices = content.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(?:[-*]\s*)?([A-Z]|\d+)[).:]\s+(.+?)\s*$/)
    if (!match) return []
    return [{ key: match[1], label: match[2].replace(/\*\*/g, "").trim() }]
  })

  return choices.length >= 2 ? choices : []
}
