import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"

import { PresencePips } from "@/components/editor/shared/PresencePips"
import type { Peer } from "@/lib/realtime/protocol"

function peer(userId: string, name: string): Peer {
  return { connId: `c-${userId}`, userId, name }
}

describe("PresencePips — smoke", () => {
  it("renders nothing when no one is present", () => {
    const { container } = render(<PresencePips peers={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it("renders a pip per peer and labels who is editing", () => {
    const { getByLabelText, container } = render(
      <PresencePips peers={[peer("u1", "Ada"), peer("u2", "Babbage")]} />,
    )
    expect(getByLabelText(/Ada, Babbage are editing/i)).toBeInTheDocument()
    // two colour dots, no overflow chip
    expect(container.querySelectorAll("span.rounded-full")).toHaveLength(2)
    expect(container.textContent).not.toContain("+")
  })

  it("collapses more than three peers into a +N chip", () => {
    const peers = ["u1", "u2", "u3", "u4", "u5"].map((u) => peer(u, u.toUpperCase()))
    const { container } = render(<PresencePips peers={peers} />)
    expect(container.querySelectorAll("span.rounded-full")).toHaveLength(3)
    expect(container.textContent).toContain("+2")
  })
})
