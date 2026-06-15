import type {
  Category,
  Workspace,
  WorkspacesResponse,
} from "@/services/workspace"

// ─── Workspaces ───────────────────────────────────────────────────────────

export interface WorkspaceStorage {
  listCategories(): Promise<Category[]>
  list(): Promise<WorkspacesResponse>
  createPersonal(userId: string, categorySlugs: string[]): Promise<{ workspaces: Workspace[] }>
  /** Local build creates a purely-local org; hosted build creates a real one. */
  createOrg(input: { name: string; description?: string; category_slugs?: string[] }): Promise<Workspace>
  get(workspaceId: string): Promise<Workspace>
  update(workspaceId: string, patch: Partial<Workspace>): Promise<Workspace>
  delete(workspaceId: string): Promise<void>
  enableCategory(workspaceId: string, slug: string): Promise<Workspace>
  disableCategory(workspaceId: string, slug: string): Promise<Workspace>
}
