"use client"

import React, { createContext, useCallback, useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { SessionExpiryModal } from "@/components/session-expiry-modal"
import { apiClient, ApiError } from "@/lib/api"

/**
 * Shape of the authenticated user stored in React state. The server owns the
 * session via an httpOnly cookie; this object is a cache for the UI layer.
 */
export interface AuthUser {
  id: string
  email: string
  username: string
  tag: string
  role: string
  name: string
  lastName: string
}

/**
 * Shape returned by the gateway's `/login`, `/register`, and `/users/me`
 * endpoints. Access tokens are delivered only as httpOnly cookies, so the
 * client never sees them — the API returns the user profile alone.
 */
interface AuthEnvelope {
  user: {
    id: string
    email: string
    username: string
    usernameTag: string
    name: string
    lastName: string
    role?: string
  }
}

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  user: AuthUser | null
  /** Store the user object returned by login/register. No token parameter —
   *  the JWT lives in an httpOnly cookie the browser attaches automatically. */
  login: (user: AuthUser) => void
  /** Call POST /logout to clear the server cookie, then wipe local state. */
  logout: () => Promise<void>
  updateUser: (updates: Partial<AuthUser>) => void
  /** Manually open the "session expired" modal, e.g. from a top-level handler. */
  showSessionExpired: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/** Maps the wire-format user envelope to the in-memory AuthUser shape. */
const toAuthUser = (u: AuthEnvelope["user"]): AuthUser => ({
  id: u.id,
  email: u.email,
  username: u.username,
  tag: u.usernameTag,
  role: u.role ?? "user",
  name: u.name ?? "",
  lastName: u.lastName ?? "",
})

/**
 * Provides authentication state to the rest of the app. Hydrates on mount by
 * calling `GET /api/v1/users/me` — a 200 means the session cookie is valid, a
 * 401 means the user is signed out. There is no JWT decoding client-side.
 */
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const router = useRouter()

  const login = useCallback((u: AuthUser) => {
    setUser(u)
    setSessionExpired(false)
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiClient("api/v1/logout", { method: "POST" })
    } catch {
      // Network or 401 here is harmless — we're going to clear state anyway.
    }
    setUser(null)
    setSessionExpired(false)
    router.push("/login")
  }, [router])

  const showSessionExpired = useCallback(() => {
    setSessionExpired(true)
  }, [])

  const updateUser = useCallback((updates: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev))
  }, [])

  // Initial session hydration.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await apiClient<AuthEnvelope>("api/v1/users/me", { method: "GET" })
        if (!cancelled) {
          setUser(toAuthUser(data.user))
        }
      } catch (err) {
        // 401 is expected for signed-out users — just leave user=null.
        if (!cancelled && !(err instanceof ApiError && err.status === 401)) {
          console.warn("Auth hydration failed:", err)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Open the expired-session modal whenever an API call reports 401.
  useEffect(() => {
    const onExpired = () => {
      setUser((prev) => {
        if (prev !== null) setSessionExpired(true)
        return null
      })
    }
    window.addEventListener("session-expired", onExpired)
    return () => window.removeEventListener("session-expired", onExpired)
  }, [])

  if (isLoading) {
    return <div>Loading Authentication...</div>
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: user !== null,
        isLoading,
        user,
        login,
        logout,
        updateUser,
        showSessionExpired,
      }}
    >
      {children}
      <SessionExpiryModal
        isOpen={sessionExpired}
        type="expired"
        userEmail={user?.email}
        onLogin={(u) => login(u)}
        onLogout={() => {
          setSessionExpired(false)
          router.push("/login")
        }}
      />
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
