/**
 * Per-domain Storage contracts. Each file owns one sub-interface plus the
 * input/entity types declared alongside it. This barrel re-exports them all
 * so callers can keep importing from `@/lib/storage` unchanged.
 */

import type { AuthResponse, RegisterRequest } from "@/services/auth"
import type {
  Act,
  Character,
  Comment,
  CreateProjectRequest,
  FullProject,
  Location,
  Project,
  ProjectCollaborator,
  Scene,
  ProjectElement,
  UpdateProjectRequest,
} from "@/services/project"
import type { Beat, BeatBoardData, Connection } from "@/services/beat"
import type { Lane, OutlineItem } from "@/services/beat-board"
import type {
  Category,
  Workspace,
  WorkspaceMember,
  WorkspacesResponse,
} from "@/services/workspace"
import type {
  CreateElementRequest,
  UpdateElementRequest,
} from "@/services/editor"
import type { AIChatRequest } from "@/services/ai"
import type { Invitation } from "@/services/invites"
import type {
  DataDeletionRequest,
  UpdateProfileData,
  UpdateProfileResponse,
} from "@/services/settings"
import type {
  BillingAuditLog,
  GatewayConfig,
  MyBilling,
  PaymentGateway,
  SubscriptionTier,
  UsageMetrics,
  UserSubscription,
} from "@/types/billing"

export * from "./auth"
export * from "./projects"
export * from "./scenes"
export * from "./elements"
export * from "./characters"
export * from "./locations"
export * from "./beat-board"
export * from "./workspaces"
export * from "./collaboration"
export * from "./notifications"
export * from "./settings"
export * from "./vault"
export * from "./knowledge"
export * from "./ai"
export * from "./billing"
export * from "./admin-billing"
export * from "./sync"

export type {
  Act,
  AIChatRequest,
  AuthResponse,
  Beat,
  BeatBoardData,
  BillingAuditLog,
  Category,
  Character,
  Comment,
  Connection,
  CreateElementRequest,
  CreateProjectRequest,
  DataDeletionRequest,
  FullProject,
  GatewayConfig,
  Invitation,
  Lane,
  Location,
  MyBilling,
  OutlineItem,
  PaymentGateway,
  Project,
  ProjectCollaborator,
  RegisterRequest,
  Scene,
  ProjectElement,
  SubscriptionTier,
  UpdateElementRequest,
  UpdateProfileData,
  UpdateProfileResponse,
  UpdateProjectRequest,
  UsageMetrics,
  UserSubscription,
  Workspace,
  WorkspaceMember,
  WorkspacesResponse,
}
