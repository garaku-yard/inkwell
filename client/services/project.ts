import { apiClient } from "@/lib/api";

export interface Project {
  id: string;
  userId: string;
  projectName: string;
  description: string;
  collaboratorCount: number;
  isStarred: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  projectName: string;
  description?: string;
}

export interface UpdateProjectRequest {
  projectName?: string;
  description?: string;
}

export interface ScriptElement {
  id: string;
  sceneId: string;
  elementOrder: number;
  elementType: 'ACTION' | 'CHARACTER' | 'DIALOG' | 'PARENTHETICAL' | 'SHOT' | 'TRANSITION';
  content: string;
  characterId: string | null;
}

export interface Scene {
  id: string;
  actId: string;
  sceneNumber: number;
  setting: string;
  elements: ScriptElement[];
}

export interface Act {
  id: string;
  projectId: string;
  actNumber: number;
  title: string | null;
  scenes: Scene[];
}

export interface FullProject extends Project {
  acts: Act[];
}


// --- Service Functions ---

/**
 * Fetches a single, complete project by its ID, including all acts,
 * scenes, and script elements.
 */
export const getProjectById = (projectId: string): Promise<FullProject> => {
  return apiClient<FullProject>(`projects/${projectId}`, {
    method: "GET",
  });
};

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
 * Adds a collaborator to a specific project.
 * @param projectId The ID of the project.
 * @param usernameWithTag The "username#tag" of the user to add.
 */
export const addCollaborator = (projectId: string, usernameWithTag: string): Promise<any> => {
  return apiClient(`projects/${projectId}/collaborators`, {
    method: 'POST',
    body: { usernameWithTag }, // The API expects this specific body shape
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
