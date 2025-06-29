// client/services/authService.ts

import { apiClient } from "@/lib/api";
// This path might need to be adjusted based on your final folder structure.
import { LoginRequest } from "../app/(public)/login/page";

// UPDATED: The request payload for registration now includes a username.
export interface RegisterRequest {
  name: string;
  lastName: string;
  username: string; // <-- NEW
  email: string;
  password: string;
}

interface LoginResponse {
  token: string;
}

// UPDATED: This now reflects the new 'users' table schema with UUIDs and username details.
interface UserResponse {
  id: string; // This will now be a UUID string
  username: string;
  usernameTag: string;
  name: string;
  lastName: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export const loginUser = (credentials: LoginRequest): Promise<LoginResponse> => {
  return apiClient<LoginResponse>("login", {
    method: "POST",
    body: credentials,
  });
};

// This function's signature now matches the new RegisterRequest interface.
export const registerUser = (userData: RegisterRequest): Promise<UserResponse> => {
  return apiClient<UserResponse>("register", {
    method: "POST",
    body: userData,
  });
};
