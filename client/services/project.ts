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
 * @param projectId The ID of the project.
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
 * @param projectId The ID of the project.
 */
export const updateProject = (projectId: string, projectData: UpdateProjectRequest): Promise<Project> => {
  return apiClient<Project>(`projects/${projectId}`, {
    method: "PUT",
    body: projectData,
  });
};

/**
 * Deletes a project.
 * @param projectId The ID of the project.
 */
export const deleteProject = (projectId: string): Promise<void> => {
  return apiClient<void>(`projects/${projectId}`, {
    method: "DELETE",
  });
};

/**
 * Updates the 'starred' status of a project.
 * @param projectId The ID of the project.
 */
export const starProject = (projectId: string, isStarred: boolean): Promise<Project> => {
  return apiClient<Project>(`projects/${projectId}`, {
    method: "PATCH",
    body: { isStarred },
  });
};

/**
 * Updates the setting of a specific scene for autosaving.
 * @param sceneId The ID of the scene.
 * @param setting The new setting text.
 */
export const updateSceneSetting = (sceneId: string, setting: string): Promise<void> => {
  return apiClient<void>(`scenes/${sceneId}`, {
    method: "PATCH",
    body: { setting },
  })
}

/**
 * Updates the content of a specific script element for autosaving.
 * @param elementId The ID of the script element.
 * @param content The new content text.
 */
export const updateScriptElementContent = (elementId: string, content: string): Promise<void> => {
  return apiClient<void>(`script-elements/${elementId}`, {
    method: "PATCH",
    body: { content },
  })
}

/**
 * Creates a new script element within a scene.
 * @param sceneId The ID of the scene to add the element to.
 * @param elementData The partial data for the new element.
 */
export const createElement = (
  sceneId: string,
  elementData: Partial<ScriptElement>,
): Promise<ScriptElement> => {
  return apiClient<ScriptElement>(`scenes/${sceneId}/elements`, {
    method: "POST",
    body: elementData,
  })
}
