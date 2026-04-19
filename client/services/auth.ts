/** Auth service — login and registration API calls. */
import { apiClient } from "@/lib/api";
import { LoginRequest } from "../app/(public)/login/page";

/** Payload sent when creating a new user account. */
export interface RegisterRequest {
  /** The user's chosen display name (first name). */
  name: string;
  /** The user's last name. */
  lastName: string;
  /** Unique username used for @mentions and the user tag. */
  username: string;
  /** Email address used for login and notifications. */
  email: string;
  /** Plain-text password; the server enforces minimum strength requirements. */
  password: string;
}

/** Public profile fields the gateway returns for an authenticated user. */
export interface AuthUserResponse {
  /** UUID of the user. */
  id: string;
  /** Unique username. */
  username: string;
  /** Numeric discriminator appended to the username (e.g. `"1234"`). */
  usernameTag: string;
  /** User's first name. */
  name: string;
  /** User's last name. */
  lastName: string;
  /** Verified email address. */
  email: string;
  /** Authorisation role, e.g. "user" or "admin". */
  role?: string;
  /** ISO 8601 timestamp of account creation. */
  createdAt: string;
  /** ISO 8601 timestamp of the last profile update. */
  updatedAt: string;
}

/** Envelope returned by `/login` and `/register`. The JWT is delivered as an
 *  httpOnly cookie, so only the user profile is visible to JavaScript. */
export interface AuthResponse {
  user: AuthUserResponse;
}

/**
 * Authenticate with email and password. On success the gateway sets an
 * httpOnly session cookie (`inkwell_token`) and returns the user profile;
 * no token is exposed to JavaScript.
 *
 * @param credentials - Email and password to authenticate with.
 * @returns A promise that resolves to an `AuthResponse` containing the user.
 * @throws {ApiError} When the credentials are invalid or the account is inactive.
 */
export const loginUser = (credentials: LoginRequest): Promise<AuthResponse> => {
  return apiClient<AuthResponse>("api/v1/login", {
    method: "POST",
    body: credentials,
  });
};

/**
 * Create a new user account. The gateway logs the user in as part of
 * registration by setting the session cookie, so no follow-up login call is
 * needed.
 *
 * @param userData - Registration fields including username, email, and password.
 * @returns A promise that resolves to the newly created user's profile.
 * @throws {ApiError} When the email or username is already taken, or when
 *   the password does not meet minimum strength requirements.
 */
export const registerUser = (userData: RegisterRequest): Promise<AuthResponse> => {
  return apiClient<AuthResponse>("api/v1/register", {
    method: "POST",
    body: userData,
  });
};
