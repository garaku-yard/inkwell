"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { SessionExpiryModal } from "@/components/session-expiry-modal"
import { FullPageSpinner } from "@/components/shared/FullPageSpinner"
import { ApiError } from "@/lib/api"
import { getStorage } from "@/lib/storage"

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
  /** Relative URL of the user's avatar (e.g. /uploads/avatars/…), if set. */
  avatarUrl?: string
  /** Whether two-factor auth is enabled. */
  twoFactorEnabled?: boolean
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
      await getStorage().auth.logout()
    } catch {
      // Network or 401 here is harmless — we're going to clear state anyway.
    }
    // Re-resolve the working identity. On the web this is null (signed out →
    // bounce to /login). On the local-first desktop build the local profile
    // remains, so we stay in the app rather than forcing a login gate it
    // doesn't need — signing out just unlinks the optional cloud account.
    let next: AuthUser | null = null
    try {
      next = await getStorage().auth.me()
    } catch {
      // treat as fully signed out
    }
    setUser(next)
    setSessionExpired(false)
    if (next === null) router.push("/login")
  }, [router])

  const showSessionExpired = useCallback(() => {
    setSessionExpired(true)
  }, [])

  const updateUser = useCallback((updates: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev))
  }, [])

  // Initial session hydration. Storage is already bound by StorageProvider,
  // so `getStorage().auth.me()` returns synchronously-resolvable data — the
  // remote impl hits `/users/me`, the desktop impl returns the local profile.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const me = await getStorage().auth.me()
        if (!cancelled && me !== null) {
          setUser(me)
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

  // Memoised so consumers don't re-render on every AuthProvider render; the
  // callbacks are already stable via useCallback.
  const value = useMemo<AuthContextType>(
    () => ({
      isAuthenticated: user !== null,
      isLoading,
      user,
      login,
      logout,
      updateUser,
      showSessionExpired,
    }),
    [user, isLoading, login, logout, updateUser, showSessionExpired],
  )

  if (isLoading) {
    // Themed full-viewport spinner instead of an unstyled flash; it inherits
    // the active theme tokens already applied by ThemeProvider above us.
    return <FullPageSpinner />
  }

  return (
    <AuthContext.Provider value={value}>
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
