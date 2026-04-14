"use client"

import { useState } from "react"
import { Camera, Check, X, Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/AuthContext"
import { updateUserProfile } from "@/services/settings"

interface AccountSectionProps {
  user: {
    id: string
    email: string
    username: string
    role: string
  } | null
}

export function AccountSection({ user }: AccountSectionProps) {
  const [isEditingUsername, setIsEditingUsername] = useState(false)
  const [isEditingDisplayName, setIsEditingDisplayName] = useState(false)
  const [isEditingEmail, setIsEditingEmail] = useState(false)
  const [username, setUsername] = useState(user?.username || "")
  const [displayName, setDisplayName] = useState(user?.username || "")
  const [email, setEmail] = useState(user?.email || "")
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const { updateUser } = useAuth()

  const handleSaveUsername = async () => {
    setIsLoading(true)
    try {
      await updateUserProfile({ username })
      updateUser({ username })
      toast({ title: "Username updated", description: "Your username has been successfully changed." })
      setIsEditingUsername(false)
    } catch (error) {
      toast({ title: "Failed to update", description: "Could not update username.", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveDisplayName = async () => {
    setIsLoading(true)
    try {
      // Display name maps to username in the current schema
      await updateUserProfile({ username: displayName })
      updateUser({ username: displayName })
      toast({ title: "Display name updated", description: "Your display name has been successfully changed." })
      setIsEditingDisplayName(false)
    } catch (error) {
      toast({ title: "Failed to update", description: "Could not update display name.", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveEmail = async () => {
    setIsLoading(true)
    try {
      await updateUserProfile({ email })
      updateUser({ email })
      toast({
        title: "Email updated",
        description: "Your email address has been successfully changed."
      })
      setIsEditingEmail(false)
    } catch (error) {
      toast({ title: "Failed to update", description: "Could not update email.", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>
            Manage your personal information and how others see you
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Profile Picture */}
          <div className="flex items-start gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src="" />
              <AvatarFallback className="text-lg">
                {user?.username?.slice(0, 2).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <Label>Profile Picture</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Upload a profile picture to personalize your account
              </p>
              <Button variant="outline" size="sm" className="mt-2">
                <Camera className="h-4 w-4 mr-2" />
                Upload Photo
              </Button>
            </div>
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            {isEditingUsername ? (
              <div className="flex gap-2">
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  disabled={isLoading}
                />
                <Button size="icon" onClick={handleSaveUsername} disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
                <Button size="icon" variant="outline" onClick={() => {
                  setUsername(user?.username || "")
                  setIsEditingUsername(false)
                }} disabled={isLoading}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-md text-sm">
                  {user?.username}
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsEditingUsername(true)}>
                  Edit
                </Button>
              </div>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Your unique username. This is how others will find you.
            </p>
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            {isEditingDisplayName ? (
              <div className="flex gap-2">
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display name"
                  disabled={isLoading}
                />
                <Button size="icon" onClick={handleSaveDisplayName} disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
                <Button size="icon" variant="outline" onClick={() => {
                  setDisplayName(user?.username || "")
                  setIsEditingDisplayName(false)
                }} disabled={isLoading}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-md text-sm">
                  {displayName}
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsEditingDisplayName(true)}>
                  Edit
                </Button>
              </div>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            {isEditingEmail ? (
              <div className="flex gap-2">
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  disabled={isLoading}
                />
                <Button size="icon" onClick={handleSaveEmail} disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
                <Button size="icon" variant="outline" onClick={() => {
                  setEmail(user?.email || "")
                  setIsEditingEmail(false)
                }} disabled={isLoading}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-md text-sm">
                  {user?.email}
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsEditingEmail(true)}>
                  Edit
                </Button>
              </div>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Used for login and important notifications. Changes require email verification.
            </p>
          </div>

          {/* Account Type */}
          <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-800">
            <Label>Account Type</Label>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm">
                {user?.role === "admin" ? "Pro" : "Free"}
              </Badge>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {user?.role === "admin" ? "You have access to all premium features" : "Upgrade to unlock premium features"}
              </span>
            </div>
            {user?.role !== "admin" && (
              <Button variant="default" size="sm" className="mt-2">
                Upgrade to Pro
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
