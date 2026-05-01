import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"

import { AIChatPanel } from "@/components/editor/AIChatPanel"
import type { AIProviderSettings } from "@/lib/storage"

import { installFakeStorage } from "../helpers/fake-storage"

// streamChatCompletion is fetch-backed and we don't want to hit it from
// a smoke test — stub the module so the import resolves with a no-op.
vi.mock("@/services/ai", () => ({
  streamChatCompletion: vi.fn(),
}))

describe("AIChatPanel — smoke", () => {
  beforeEach(() => {
    const fail = async () => {
      throw new Error("not in this test")
    }
    installFakeStorage({
      ai: {
        listProviderSettings: async (): Promise<AIProviderSettings[]> => [],
        saveProviderSettings: fail as never,
        deleteProviderSettings: fail,
        setApiKey: fail,
        clearApiKey: fail,
        streamChat: fail as never,
        testProvider: fail as never,
      },
    })
  })

  it("renders the welcome message when opened", async () => {
    render(
      <AIChatPanel
        isOpen={true}
        onClose={() => {}}
        category="screenplay"
        projectId="test-project-id"
      />,
    )
    expect(await screen.findByText(/Writing Buddy/i)).toBeInTheDocument()
  })

  it("shows the empty state when no providers are configured", async () => {
    render(
      <AIChatPanel
        isOpen={true}
        onClose={() => {}}
        category="screenplay"
        projectId="test-project-id"
      />,
    )
    await waitFor(() => {
      expect(screen.getByText(/No AI providers configured yet/i)).toBeInTheDocument()
    })
  })
})
