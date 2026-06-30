import { describe, it, expect, afterEach } from "vitest"

import { caretOffsetInElement, editableHostFromSelection } from "@/lib/realtime/caret-dom"

/** Put the collapsed caret at `offset` characters into the first text node of
 *  `host` and return the live selection. */
function placeCaret(host: HTMLElement, offset: number) {
  const text = host.firstChild as Text
  const range = document.createRange()
  range.setStart(text, offset)
  range.collapse(true)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

afterEach(() => {
  document.body.innerHTML = ""
  window.getSelection()?.removeAllRanges()
})

describe("caret-dom offset mapping", () => {
  it("reports the caret's character offset within its editable host", () => {
    const host = document.createElement("div")
    host.id = "el-1"
    host.setAttribute("contenteditable", "true")
    host.textContent = "Hello World"
    document.body.appendChild(host)

    placeCaret(host, 5)
    expect(caretOffsetInElement(host)).toBe(5)

    placeCaret(host, 0)
    expect(caretOffsetInElement(host)).toBe(0)
  })

  it("resolves the editable host (with id) holding the selection", () => {
    const host = document.createElement("div")
    host.id = "head-7"
    host.setAttribute("contenteditable", "true")
    host.textContent = "Title"
    document.body.appendChild(host)

    placeCaret(host, 2)
    expect(editableHostFromSelection()).toBe(host)
  })

  it("ignores a selection outside any editable", () => {
    const plain = document.createElement("p")
    plain.textContent = "not editable"
    document.body.appendChild(plain)
    placeCaret(plain, 3)
    expect(editableHostFromSelection()).toBeNull()
  })
})
