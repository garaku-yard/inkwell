import type {
  CreateProjectRequest,
  FullProject,
  Project,
  UpdateProjectRequest,
} from "@/services/project"

// ─── Projects ─────────────────────────────────────────────────────────────

export interface ProjectStorage {
  create(input: CreateProjectRequest): Promise<Project>
  getById(projectId: string, userId: string): Promise<Project>
  /** Fetches project + scenes + elements + comments in one logical call.
   *  Remote stitches multiple HTTP calls; local can do one SQL join. */
  getFull(projectId: string, userId: string): Promise<FullProject>
  listOwned(userId: string): Promise<{ projects: Project[]; total: number }>
  /** Projects shared with the caller (collaboration capability required). */
  listShared(): Promise<Project[]>
  update(projectId: string, userId: string, patch: UpdateProjectRequest): Promise<Project>
  toggleStar(projectId: string, userId: string): Promise<Project>
  delete(projectId: string, userId: string): Promise<void>
}
