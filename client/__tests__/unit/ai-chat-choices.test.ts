import { describe, expect, it } from "vitest"

import { extractChatChoices } from "@/components/editor/ai-chat/choices"

describe("extractChatChoices", () => {
  it("extracts lettered options when the assistant asks the reader to choose", () => {
    expect(extractChatChoices("How do you want to proceed?\nA) Investigate the device\nB) Search the station"))
      .toEqual([
        { key: "A", label: "Investigate the device" },
        { key: "B", label: "Search the station" },
      ])
  })

  it("extracts numbered suggestions when the assistant asks which direction fits", () => {
    expect(extractChatChoices("1. **Signal**: Follow a transmission\n2. **Memory**: Recover a clue\n\nWhich direction resonates?"))
      .toEqual([
        { key: "1", label: "Signal: Follow a transmission" },
        { key: "2", label: "Memory: Recover a clue" },
      ])
  })

  it("leaves explanatory lists as ordinary markdown", () => {
    expect(extractChatChoices("Useful facts:\n1. The station is abandoned\n2. Earth is distant"))
      .toEqual([])
  })
})
