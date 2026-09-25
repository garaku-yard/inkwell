"use client"

import type { Dispatch, SetStateAction } from "react"
import { importIntoProject } from "@/lib/import/import-into-project"
import {
  captureDocumentRevision, projectFromRevision, projectFromTemplate,
  type DocumentRevision, type DocumentTemplate,
} from "@/lib/editor/document-foundation"
import { updateSceneContent, type Scene } from "@/services/project"

interface Options {
  projectId: string
  userId?: string
  scenes: Scene[]
  setScenes: Dispatch<SetStateAction<Scene[]>>
}

export function useDocumentFoundation({ projectId, userId, scenes, setScenes }: Options) {
  const append = async (parsed: ReturnType<typeof projectFromTemplate>) => {
    if (!userId) throw new Error("Sign in to create a document.")
    const created = await importIntoProject(projectId, userId, parsed, scenes.length)
    setScenes((current) => [...current, ...created])
  }

  const createFromTemplate = (template: DocumentTemplate) => append(projectFromTemplate(template))

  const captureRevision = async (sceneId: string, label: string) => {
    if (!userId) throw new Error("Sign in to save a revision.")
    const scene = scenes.find((item) => item.id === sceneId)
    if (!scene) throw new Error("This document is no longer available.")
    const content = captureDocumentRevision(scene, label, crypto.randomUUID(), new Date().toISOString())
    await updateSceneContent(sceneId, userId, content)
    setScenes((current) => current.map((item) => item.id === sceneId ? { ...item, content } : item))
  }

  const openVariant = (revision: DocumentRevision) => append(projectFromRevision(revision))

  return { createFromTemplate, captureRevision, openVariant }
}
