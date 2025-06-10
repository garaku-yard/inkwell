"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FileText, Plus, Search, Users, Clock, Star, MoreHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { NewProjectDialog } from "./new-project-dialog"

const projects = [
  {
    id: "1",
    title: "The Last Sunset",
    type: "Feature Film",
    lastEdited: "2 hours ago",
    collaborators: 2,
    starred: true,
  },
  {
    id: "2",
    title: "City Lights",
    type: "Short Film",
    lastEdited: "Yesterday",
    collaborators: 0,
    starred: true,
  },
  {
    id: "3",
    title: "Midnight Express",
    type: "TV Pilot",
    lastEdited: "3 days ago",
    collaborators: 1,
    starred: false,
  },
  {
    id: "4",
    title: "The Silent Echo",
    type: "Feature Film",
    lastEdited: "1 week ago",
    collaborators: 0,
    starred: false,
  },
  {
    id: "5",
    title: "Beyond the Horizon",
    type: "Short Film",
    lastEdited: "2 weeks ago",
    collaborators: 3,
    starred: false,
  },
]

export default function Dashboard() {
  const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()

  const filteredProjects = projects.filter((project) => project.title.toLowerCase().includes(searchQuery.toLowerCase()))

  const handleProjectClick = (projectId: string) => {
    router.push(`/project/${projectId}`)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="container mx-auto flex items-center justify-between py-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6" />
            <h1 className="text-xl font-bold">Screenwriter</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="outline" size="sm">
                Log In
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Sign Up</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex flex-col items-center py-6">
        <div className="w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold">My Projects</h2> {/* Left side */}
            <Button onClick={() => setIsNewProjectDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row items-center gap-4 mb-6 w-full">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Tabs defaultValue="all" className="w-full sm:w-auto">
              <TabsList className="w-full">
                <TabsTrigger value="all" className="w-full sm:w-auto">
                  All
                </TabsTrigger>
                <TabsTrigger value="recent" className="w-full sm:w-auto">
                  Recent
                </TabsTrigger>
                <TabsTrigger value="starred" className="w-full sm:w-auto">
                  Starred
                </TabsTrigger>
                <TabsTrigger value="shared" className="w-full sm:w-auto">
                  Shared
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Projects Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
            {filteredProjects.map((project) => (
              <Card
                key={project.id}
                className="overflow-hidden hover:shadow-xl hover:scale-105 transition-all duration-300 ease-in-out transform cursor-pointer"
                onClick={() => handleProjectClick(project.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-lg hover:text-primary">{project.title}</h3>
                      <p className="text-sm text-muted-foreground">{project.type}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => e.stopPropagation()} // Prevent card click when clicking dropdown
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={(e) => e.stopPropagation()}>Rename</DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => e.stopPropagation()}>Duplicate</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={(e) => e.stopPropagation()}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
                <CardFooter className="p-4 pt-0 flex justify-between text-sm text-muted-foreground">
                  <div className="flex items-center">
                    <Clock className="h-3.5 w-3.5 mr-1" />
                    {project.lastEdited}
                  </div>
                  <div className="flex items-center gap-3">
                    {project.starred && <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />}
                    {project.collaborators > 0 && (
                      <div className="flex items-center">
                        <Users className="h-3.5 w-3.5 mr-1" />
                        {project.collaborators}
                      </div>
                    )}
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>

          {/* Empty State */}
          {filteredProjects.length === 0 && (
            <div className="text-center py-12 w-full">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">No projects found</h3>
              <p className="text-muted-foreground mt-2">
                {searchQuery ? "Try a different search term" : "Create your first screenplay project to get started"}
              </p>
              {!searchQuery && (
                <Button className="mt-4" onClick={() => setIsNewProjectDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Project
                </Button>
              )}
            </div>
          )}
        </div>
      </main>

      {/* New Project Dialog */}
      <NewProjectDialog open={isNewProjectDialogOpen} onOpenChange={setIsNewProjectDialogOpen} />
    </div>
  )
}
