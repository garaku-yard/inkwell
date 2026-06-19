"use client"

import type React from "react"
import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Eye, EyeOff, AlertCircle } from "lucide-react"

import { BrandLogo } from "@/components/brand-logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

import { loginUser } from "@/services/auth"
import { useAuth } from "@/lib/AuthContext"
import { FullPageSpinner } from "@/components/shared/FullPageSpinner"

export interface LoginRequest {
  email: string
  password: string
  totpCode?: string
}

function LoginPageContent() {
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [totpRequired, setTotpRequired] = useState(false)
  const [totpCode, setTotpCode] = useState("")

  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuth()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get("next") || "/dashboard"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const data = await loginUser({
        email,
        password,
        totpCode: totpRequired ? totpCode : undefined,
      });

      // 2FA is enabled — switch to the code step and prompt for it.
      if (data.totpRequired) {
        setTotpRequired(true);
        return;
      }

      if (!data.user) {
        setError("Unexpected response from the server.");
        return;
      }

      login({
        id: data.user.id,
        email: data.user.email,
        username: data.user.username,
        tag: data.user.usernameTag,
        role: data.user.role ?? "user",
        name: data.user.name ?? "",
        lastName: data.user.lastName ?? "",
      });
      window.location.href = nextPath;

    } catch (err: unknown) {
      // In the code step a 401 means the code was wrong, not the password.
      if (totpRequired) {
        setError("Invalid code. Try your authenticator again or use a recovery code.");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred");
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <BrandLogo />
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">Welcome back</CardTitle>
            <CardDescription className="text-center">Sign in to your account to continue writing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Login Failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {!totpRequired ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={isLoading}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-foreground">
                      Forgot password?
                    </Link>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="totpCode">Authentication code</Label>
                  <Input
                    id="totpCode"
                    inputMode="text"
                    autoComplete="one-time-code"
                    placeholder="6-digit code or recovery code"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    required
                    autoFocus
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the code from your authenticator app, or one of your recovery codes.
                  </p>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading
                  ? (totpRequired ? "Verifying..." : "Signing In...")
                  : (totpRequired ? "Verify" : "Sign In")}
              </Button>
            </form>


            <div className="text-center text-sm">
              {"Don't have an account? "}
              <Link href="/register" className="font-medium text-primary hover:underline">
                Sign up
              </Link>
            </div>
          </CardContent>
        </Card>
        <nav className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground [&_a]:hover:text-foreground [&_a]:hover:underline">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/refund">Refunds</Link>
        </nav>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <LoginPageContent />
    </Suspense>
  )
}
