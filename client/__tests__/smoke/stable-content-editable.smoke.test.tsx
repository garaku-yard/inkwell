import { act, fireEvent, render } from "@testing-library/react"
import { createRef, useState } from "react"
import { describe, expect, it } from "vitest"

import {
  StableContentEditable,
  type StableContentEditableHandle,
} from "@/components/editor/shared/StableContentEditable"

/** Tiny harness that mirrors how the format editors use the primitive:
 *  parent owns the value, primitive owns the DOM. */
function ControlledHarness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <div>
      <StableContentEditable
        data-testid="ce"
        value={value}
        onValueChange={setValue}
      />
      <span data-testid="value">{value}</span>
    </div>
  )
}

describe("StableContentEditable", () => {
  it("renders the initial value into the DOM on mount", () => {
    const { getByTestId } = render(<ControlledHarness initial="hello" />)
    expect(getByTestId("ce").textContent).toBe("hello")
  })

  it("emits onValueChange with the typed text", () => {
    const { getByTestId } = render(<ControlledHarness initial="" />)
    const ce = getByTestId("ce") as HTMLDivElement
    ce.textContent = "typed"
    fireEvent.input(ce)
    expect(getByTestId("value").textContent).toBe("typed")
  })

  it("does NOT re-write the DOM while the user is typing — the cursor-stable contract", () => {
    // Reproduces the original bug: parent re-renders the editor with
    // the same string the user just typed (autosave round-trip). If
    // we wrote to the DOM here, the cursor would collapse to the start.
    const { getByTestId } = render(<ControlledHarness initial="" />)
    const ce = getByTestId("ce") as HTMLDivElement

    // Focus + type
    ce.focus()
    ce.textContent = "live edit"
    fireEvent.input(ce)
    expect(getByTestId("value").textContent).toBe("live edit")

    // Spy on whether the DOM gets rewritten under the user's cursor.
    // We can't directly watch property writes, but we can mark the
    // element and confirm the marker is intact after a render with
    // the same value (which would otherwise trigger a sync write).
    const marker = document.createElement("mark")
    marker.id = "marker"
    ce.appendChild(marker)

    // Trigger a re-render with the same value — the element is still
    // focused, so the sync effect should bail out and leave our
    // marker alone.
    fireEvent.input(ce)
    expect(document.getElementById("marker")).not.toBeNull()
  })

  it("syncs an external value change into the DOM when not focused", () => {
    function Externally() {
      const [value, setValue] = useState("first")
      return (
        <div>
          <StableContentEditable
            data-testid="ce"
            value={value}
            onValueChange={() => {
              /* ignore */
            }}
          />
          <button onClick={() => setValue("second")}>change</button>
        </div>
      )
    }
    const { getByText, getByTestId } = render(<Externally />)
    const ce = getByTestId("ce")
    expect(ce.textContent).toBe("first")
    act(() => {
      getByText("change").click()
    })
    expect(ce.textContent).toBe("second")
  })

  it("does NOT clobber a focused user when the prop changes (cursor-stable contract)", () => {
    function Externally() {
      const [extValue, setExtValue] = useState("baseline")
      return (
        <div>
          <StableContentEditable
            data-testid="ce"
            value={extValue}
            onValueChange={() => {
              /* ignore */
            }}
          />
          <button onClick={() => setExtValue("clobber attempt")}>change</button>
        </div>
      )
    }
    const { getByText, getByTestId } = render(<Externally />)
    const ce = getByTestId("ce") as HTMLDivElement

    // User focuses + types something locally that diverges from the
    // prop.
    ce.focus()
    ce.textContent = "user typed"
    fireEvent.input(ce)

    // Parent fires an external update — but the user is still focused.
    act(() => {
      getByText("change").click()
    })

    // The DOM should still reflect what the user typed, NOT the
    // external "clobber attempt" value. The new prop will take effect
    // when the element next loses focus.
    expect(ce.textContent).toBe("user typed")
  })

  it("exposes setContent / getContent / focus on the imperative handle", () => {
    const handleRef = createRef<StableContentEditableHandle>()
    const { getByTestId } = render(
      <StableContentEditable
        ref={handleRef}
        data-testid="ce"
        value="seeded"
        onValueChange={() => {
          /* ignore */
        }}
      />,
    )
    const ce = getByTestId("ce") as HTMLDivElement

    expect(handleRef.current?.getContent()).toBe("seeded")

    act(() => {
      handleRef.current?.setContent("imperatively replaced")
    })
    expect(ce.textContent).toBe("imperatively replaced")
    expect(handleRef.current?.getContent()).toBe("imperatively replaced")

    expect(handleRef.current?.element).toBe(ce)
  })

  it('uses innerHTML in mode="html" so formatted text round-trips', () => {
    const handleRef = createRef<StableContentEditableHandle>()
    const { getByTestId } = render(
      <StableContentEditable
        ref={handleRef}
        data-testid="ce"
        mode="html"
        value="<b>bold</b> normal"
        onValueChange={() => {
          /* ignore */
        }}
      />,
    )
    const ce = getByTestId("ce") as HTMLDivElement
    expect(ce.innerHTML).toBe("<b>bold</b> normal")
    expect(handleRef.current?.getContent()).toBe("<b>bold</b> normal")
  })

  it("mirrors data-placeholder to aria-placeholder for screen readers", () => {
    const { getByTestId } = render(
      <StableContentEditable
        data-testid="ce"
        data-placeholder="Type a thing…"
        value=""
        onValueChange={() => {
          /* ignore */
        }}
      />,
    )
    expect(getByTestId("ce").getAttribute("aria-placeholder")).toBe(
      "Type a thing…",
    )
  })
})
