import { useState } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { TriggerBlockEditor } from "@/components/editor/if/TriggerBlockEditor"
import { defaultTriggerBlock, parseTriggerBlock, serializeTriggerBlock } from "@/lib/interactive-fiction/runtime"

function Harness() {
  const [value, setValue] = useState(serializeTriggerBlock(defaultTriggerBlock()))
  return <><TriggerBlockEditor id="trigger" value={value} onValueChange={setValue} /><output data-testid="value">{value}</output></>
}

describe("IF trigger editor", () => {
  it("authors a named event and ordered actions", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const label = screen.getByRole("textbox", { name: "Trigger label" })
    await user.clear(label)
    await user.type(label, "First pour")
    expect(screen.getByRole("textbox", { name: "Trigger event name" })).toHaveValue("first_pour")

    await user.type(screen.getByRole("textbox", { name: "Trigger action 1" }), "The basin begins to fill.")
    await user.click(screen.getByRole("button", { name: "Variable" }))
    const actions = screen.getAllByRole("textbox", { name: /Trigger action \d/ })
    fireEvent.change(actions[1], { target: { value: "{set $water_started:boolean to true}" } })

    const trigger = parseTriggerBlock(screen.getByTestId("value").textContent ?? "")
    expect(trigger).toMatchObject({
      event: "first_pour",
      label: "First pour",
      actions: [
        { kind: "reveal", content: "The basin begins to fill." },
        { kind: "set", content: "{set $water_started:boolean to true}" },
      ],
    })
  })
})
