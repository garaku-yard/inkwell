import type React from "react"
import { useCallback } from "react"

import { createBeat, updateBeat, type Beat } from "@/services/beat"
import { toCanvasPoint } from "./canvasGeometry"

interface UseBeatImageUploadOptions {
  projectId: string
  beats: Beat[]
  setBeats: React.Dispatch<React.SetStateAction<Beat[]>>
  /** The canvas surface — used to convert the drop point into canvas
   *  coordinates, so an image dropped below the fold lands under the
   *  cursor rather than back up at the top. */
  surfaceRef: React.RefObject<HTMLDivElement | null>
  snapToGrid: (value: number) => number
}

interface UseBeatImageUploadResult {
  /** Open a hidden file picker, upload the chosen image, and attach it
   *  to the existing beat row by id. */
  uploadImageForBeat: (beatId: string) => void
  /** Drop-handler for the canvas: when an image file is dropped, upload
   *  it and create a fresh beat at the drop coordinates. */
  onImageDrop: (e: React.DragEvent<HTMLDivElement>) => Promise<void>
}

/** Owns the image upload + compress pipeline for beat-board cards.
 *  Compression caps at 1024×1024 / quality 0.8 — defensible default
 *  for canvas thumbnails; the server stores whatever bytes we send. */
export function useBeatImageUpload({
  projectId,
  beats,
  setBeats,
  surfaceRef,
  snapToGrid,
}: UseBeatImageUploadOptions): UseBeatImageUploadResult {
  const uploadImageForBeat = useCallback(
    (beatId: string) => {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = "image/*"
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return
        try {
          const imageUrl = await uploadImage(file)
          setBeats((prev) =>
            prev.map((b) => (b.id === beatId ? { ...b, imageUrl } : b)),
          )
          await updateBeat(beatId, { imageUrl })
        } catch (err) {
          console.error("Failed to upload image:", err)
        }
      }
      input.click()
    },
    [setBeats],
  )

  const onImageDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()

      const files = Array.from(e.dataTransfer.files)
      const imageFile = files.find((file) => file.type.startsWith("image/"))
      if (!imageFile) return

      if (!surfaceRef.current) return
      const point = toCanvasPoint(surfaceRef.current, e.clientX, e.clientY)
      const x = snapToGrid(point.x)
      const y = snapToGrid(point.y)

      try {
        const imageUrl = await uploadImage(imageFile)
        const beatData: Partial<Beat> = {
          title: "New Image Beat",
          description: "",
          startPage: 1,
          endPage: 1,
          sceneNumbers: "Pg. 1",
          color: "#ffffff",
          imageUrl,
          position: { x, y },
          width: 250,
          height: 250,
          act: 1,
          order: beats.length,
        }
        const createdBeat = await createBeat(projectId, beatData)
        setBeats((prev) => [...prev, createdBeat])
      } catch (err) {
        console.error("Failed to create beat with image:", err)
      }
    },
    [beats.length, surfaceRef, projectId, setBeats, snapToGrid],
  )

  return { uploadImageForBeat, onImageDrop }
}

/** Re-encodes `file` to JPEG at quality 0.8, resized to fit a
 *  maxWidth×maxHeight box. Returns the compressed Blob, or rejects
 *  with the error from canvas / FileReader. */
function compressImage(
  file: File,
  maxWidth: number = 1024,
  maxHeight: number = 1024,
  quality: number = 0.8,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement("canvas")
        let width = img.width
        let height = img.height

        if (width > height) {
          if (width > maxWidth) {
            height = height * (maxWidth / width)
            width = maxWidth
          }
        } else {
          if (height > maxHeight) {
            width = width * (maxHeight / height)
            height = maxHeight
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")
        ctx?.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else reject(new Error("Failed to compress image"))
          },
          "image/jpeg",
          quality,
        )
      }
      img.onerror = reject
      img.src = e.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function uploadImage(file: File): Promise<string> {
  const compressedBlob = await compressImage(file)
  const formData = new FormData()
  formData.append("image", compressedBlob, file.name)

  const uploadResponse = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/v1/beats/upload-image`,
    {
      method: "POST",
      credentials: "include",
      body: formData,
    },
  )

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload image")
  }

  const { imageUrl } = await uploadResponse.json()
  return imageUrl
}
