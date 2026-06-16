import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"

import type { KnowledgeScope, Project } from "@/lib/storage"

import { installFakeStorage } from "../helpers/fake-storage"

// The dialog reads the signed-in user to list owned vault projects.
vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}))

import { ProjectKnowledgeDialog } from "@/components/editor/ProjectKnowledgeDialog"

const vaultProject: Project = {
  id: "vault-1",
  title: "My Vault",
  description: "",
  owner_id: "user-1",
  category: "vault",
  status: "draft",
  is_starred: false,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
}

function installStorage(scopes: KnowledgeScope[]) {
  const fail = async () => {
    throw new Error("not in this test")
  }
  installFakeStorage({
    capabilities: new Set(["ai.byo", "ai.knowledge"]),
    projects: {
      listOwned: async () => ({ projects: [vaultProject], total: 1 }),
    } as never,
    knowledge: {
      getScopes: async () => scopes,
      setScopes: fail as never,
      hasScopes: async () => scopes.length > 0,
      buildIndex: fail as never,
      getIndexStatus: async () => ({ notes: 3, chunks: 12 }),
      retrieve: fail as never,
      readNoteForTool: fail as never,
    },
  })
}

describe("ProjectKnowledgeDialog — smoke", () => {
  beforeEach(() => installStorage([]))

  it("renders the knowledge config when a vault exists", async () => {
    render(
      <ProjectKnowledgeDialog projectId="proj-1" open onOpenChange={() => {}} />,
    )
    expect(
      await screen.findByText(/Give the Writing Buddy access to your notes/i),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/Add a source/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/No sources yet/i)).toBeInTheDocument()
  })

  it("lists a wired scope and its index status", async () => {
    installStorage([
      { vaultProjectId: "vault-1", scopeType: "vault", scopeValue: "" },
    ])
    render(
      <ProjectKnowledgeDialog projectId="proj-1" open onOpenChange={() => {}} />,
    )
    expect(
      await screen.findByText(/My Vault · whole vault/i),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/3 notes · 12 chunks indexed/i)).toBeInTheDocument()
    })
  })
})
