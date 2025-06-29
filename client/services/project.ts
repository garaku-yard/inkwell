import { apiClient } from "@/lib/api";

export interface Project {
  id: string;
  userId: string;
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
 */
export const getMyProjects = (): Promise<Project[]> => {
  return apiClient<Project[]>("projects/", {
    method: "GET",
  });
};

/**
 * Creates a new project.
 */
export const createProject = (projectData: CreateProjectRequest): Promise<Project> => {
  return apiClient<Project>("projects/", {
    method: "POST",
    body: projectData,
  });
};

/**
 * Updates an existing project.
 */
export const updateProject = (projectId: string, projectData: UpdateProjectRequest): Promise<Project> => {
  return apiClient<Project>(`projects/${projectId}`, {
    method: "PUT",
    body: projectData,
  });
};

/**
 * Deletes a project.
 */
export const deleteProject = (projectId: string): Promise<void> => {
  return apiClient<void>(`projects/${projectId}`, {
    method: "DELETE",
  });
};

/**
 * Updates the 'starred' status of a project.
 */
export const starProject = (projectId: string, isStarred: boolean): Promise<Project> => {
  return apiClient<Project>(`projects/${projectId}`, {
    method: "PATCH",
    body: { isStarred },
  });
};
