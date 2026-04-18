/** Auth service — login and registration API calls. */
import { apiClient } from "@/lib/api";
import { LoginRequest } from "../app/(public)/login/page";

export interface RegisterRequest {
  name: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
}

interface LoginResponse {
  token: string;
}

interface UserResponse {
  id: string;
  username: string;
  usernameTag: string;
  name: string;
  lastName: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

/** Authenticate with email and password. Returns a JWT on success. */
export const loginUser = (credentials: LoginRequest): Promise<LoginResponse> => {
  return apiClient<LoginResponse>("login", {
    method: "POST",
    body: credentials,
  });
};

/** Create a new user account. */
export const registerUser = (userData: RegisterRequest): Promise<UserResponse> => {
  return apiClient<UserResponse>("register", {
    method: "POST",
    body: userData,
  });
};
