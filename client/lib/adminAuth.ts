import { jwtDecode } from "jwt-decode"
import { NextRequest, NextResponse } from "next/server"

interface DecodedToken {
  sub: string
  role?: string
  exp?: number
}

/**
 * Verifies the request carries a valid JWT with role=admin.
 * Returns null if authorized, or a 401/403 NextResponse if not.
 */
export function requireAdmin(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = authHeader.slice(7)
  try {
    const decoded = jwtDecode<DecodedToken>(token)

    // Check expiry
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 })
    }

    if (decoded.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    return null // authorized
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 })
  }
}
