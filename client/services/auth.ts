
import { apiClient } from "@/lib/api";
import { LoginRequest } from "@/app/login/page";
export interface RegisterRequest {
  name:     string;
  lastName: string;
  email:    string;
  password: string;
}

interface LoginResponse {
  token: string;
}

interface UserResponse {
    id: number;
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

export const registerUser = (userData: RegisterRequest): Promise<UserResponse> => {
  return apiClient<UserResponse>("register", {
      method: "POST",
      body: userData,
  });
};
