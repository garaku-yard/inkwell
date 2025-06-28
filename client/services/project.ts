import { apiClient } from "@/lib/api";

// This interface should match the Project entity in your Go backend.
// It's good practice to define this in a shared types file (e.g., 'types/index.ts').
export interface Project {
  id: number;
  userId: number;
  projectName: string;
  description: string;
  isStarred: boolean;
  createdAt: string;
  updatedAt: string;
}

// The data required to create a new project.
export interface CreateProjectRequest {
  projectName: string;
  description?: string;
}

// The data required to update an existing project.
export interface UpdateProjectRequest {
  projectName?: string;
  description?: string;
}

// --- Service Functions ---

/**
 * Fetches a list of all projects for the currently authenticated user.
 * Assumes the API will get the user ID from the JWT token.
 */
export const getMyProjects = (): Promise<Project[]> => {
  return apiClient<Project[]>("projects", {
    method: "GET",
  });
};

/**
 * Creates a new project.
 * @param projectData The data for the new project.
 */
export const createProject = (projectData: CreateProjectRequest): Promise<Project> => {
  return apiClient<Project>("projects", {
    method: "POST",
    body: projectData,
  });
};

/**
 * Updates an existing project.
 * @param projectId The ID of the project to update.
 * @param projectData The fields to update.
 */
export const updateProject = (projectId: number, projectData: UpdateProjectRequest): Promise<Project> => {
  // A PUT request to an endpoint like /projects/123
  return apiClient<Project>(`projects/${projectId}`, {
    method: "PUT",
    body: projectData,
  });
};

/**
 * Deletes a project.
 * @param projectId The ID of the project to delete.
 */
export const deleteProject = (projectId: number): Promise<void> => {
  // A DELETE request to an endpoint like /projects/123.
  // We expect a 204 No Content response, so the return type is Promise<void>.
  return apiClient<void>(`projects/${projectId}`, {
    method: "DELETE",
  });
};

/**
 * Updates the 'starred' status of a project.
 * @param projectId The ID of the project to star or unstar.
 * @param isStarred The new starred status.
 */
export const starProject = (projectId: number, isStarred: boolean): Promise<Project> => {
  // A PATCH request is ideal here, as we are only updating a single field.
  return apiClient<Project>(`projects/${projectId}`, {
    method: "PATCH",
    body: { isStarred },
  });
};
