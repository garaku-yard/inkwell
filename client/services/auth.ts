
import { apiClient } from "@/lib/api";
import { LoginRequest } from "@/app/login/page"; 

interface LoginResponse {
  token: string;
}

export const loginUser = (credentials: LoginRequest): Promise<LoginResponse> => {
  return apiClient<LoginResponse>("login", {
    method: "POST",
    body: credentials, 
  });
};

