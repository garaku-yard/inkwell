"use client"

import { useRef, useState } from "react"
import { Check, X, Loader2, Upload } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/AuthContext"
import { updateUserProfile, uploadAvatar } from "@/services/settings"

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
  const { user: authUser, updateUser } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = "" // let the same file be re-picked after an error
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast({ title: "Not an image", description: "Choose a PNG, JPEG, GIF, or WebP file.", variant: "destructive" })
      return
    }
    setIsUploadingAvatar(true)
    try {
      const url = await uploadAvatar(file)
      updateUser({ avatarUrl: url })
      toast({ title: "Avatar updated", description: "Your profile picture has been changed." })
    } catch (err) {
      toast({
        title: "Couldn't upload avatar",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsUploadingAvatar(false)
    }
  }

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
              <AvatarImage
                src={
                  authUser?.avatarUrl
                    ? `${process.env.NEXT_PUBLIC_API_URL}${authUser.avatarUrl}`
                    : undefined
                }
                alt={user?.username || "Avatar"}
              />
              <AvatarFallback className="text-lg">
                {user?.username?.slice(0, 2).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <Label>Profile Picture</Label>
              <p className="text-sm text-muted-foreground mt-1 mb-3">
                PNG, JPEG, GIF, or WebP, up to 5&nbsp;MB.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar}
              >
                {isUploadingAvatar ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {authUser?.avatarUrl ? "Change picture" : "Upload picture"}
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
