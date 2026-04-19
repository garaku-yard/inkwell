"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { useAuth } from "@/lib/AuthContext"

/**
 * Root landing route. Inkwell intentionally has no marketing landing page at
 * the moment — this shell simply routes the visitor to the right place:
 *
 * - Authenticated → `/dashboard` (real content).
 * - Anonymous → `/login`.
 *
 * The redirect is client-side because the Tauri build runs as a pure static
 * export, so there is no Next.js server to issue a 307 from.
 */
export default function Root() {
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuth()

  useEffect(() => {
    if (isLoading) return
    router.replace(isAuthenticated ? "/dashboard" : "/login")
  }, [router, isAuthenticated, isLoading])

  return null
}
