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

/** Returned by the login endpoint on success. */
interface LoginResponse {
  /** Short-lived JWT access token. Store in `localStorage` as `authToken`. */
  token: string;
}

/** Returned by the registration endpoint on success. */
interface UserResponse {
  /** UUID of the newly created user. */
  id: string;
  /** Unique username chosen during registration. */
  username: string;
  /** Numeric discriminator appended to the username (e.g. `"#1234"`). */
  usernameTag: string;
  /** User's first name. */
  name: string;
  /** User's last name. */
  lastName: string;
  /** Verified email address. */
  email: string;
  /** ISO 8601 timestamp of account creation. */
  createdAt: string;
  /** ISO 8601 timestamp of the last profile update. */
  updatedAt: string;
}

/**
 * Authenticate with email and password. On success the returned JWT should be
 * stored in `localStorage` under the key `"authToken"` for subsequent requests.
 *
 * @param credentials - Email and password to authenticate with.
 * @returns A promise that resolves to a `LoginResponse` containing the JWT.
 * @throws {Error} When the credentials are invalid or the account is inactive.
 *
 * @example
 * ```ts
 * const { token } = await loginUser({ email: "alice@example.com", password: "hunter2" });
 * localStorage.setItem("authToken", token);
 * ```
 */
export const loginUser = (credentials: LoginRequest): Promise<LoginResponse> => {
  return apiClient<LoginResponse>("login", {
    method: "POST",
    body: credentials,
  });
};

/**
 * Create a new user account. Does not automatically log the user in —
 * call `loginUser` afterward to obtain a JWT.
 *
 * @param userData - Registration fields including username, email, and password.
 * @returns A promise that resolves to the newly created user's profile.
 * @throws {Error} When the email or username is already taken.
 * @throws {Error} When the password does not meet minimum strength requirements.
 *
 * @example
 * ```ts
 * const user = await registerUser({
 *   name: "Alice",
 *   lastName: "Smith",
 *   username: "alice",
 *   email: "alice@example.com",
 *   password: "S3cur3P@ss!",
 * });
 * ```
 */
export const registerUser = (userData: RegisterRequest): Promise<UserResponse> => {
  return apiClient<UserResponse>("register", {
    method: "POST",
    body: userData,
  });
};
