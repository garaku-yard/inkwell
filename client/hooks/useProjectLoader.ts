import { useEffect, useState } from "react"

/** Result of {@link useProjectLoader}. While `isLoading` is true, both
 *  `project` and `error` are null; once a fetch settles either `project`
 *  becomes non-null on success or `error` becomes non-null on failure. */
export interface ProjectLoaderResult<T> {
  project: T | null
  isLoading: boolean
  error: string | null
}

/** Loads a project by id from any fetcher that returns the data shape
 *  the caller wants — `getFullProject` for editor pages that need
 *  scenes/elements/etc, `getProjectById` for the beat-board page that
 *  only needs metadata. The hook owns the standard `useState ×3 +
 *  useEffect with cancel guard` plumbing every project route used to
 *  duplicate by hand.
 *
 *  Behaviour: stays in `isLoading` until both `projectId` and `userId`
 *  are truthy; that matches the pre-extraction pages, which sat on the
 *  spinner if either id was missing rather than showing an empty
 *  state. Pages that need a different empty-id UX should branch on
 *  `projectId` themselves before reading from the hook. */
export function useProjectLoader<T>(
  projectId: string | undefined | null,
  userId: string | undefined | null,
  fetcher: (projectId: string, userId: string) => Promise<T>,
): ProjectLoaderResult<T> {
  const [project, setProject] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId || !userId) return
    let cancelled = false
    setIsLoading(true)
    setError(null)
    fetcher(projectId, userId)
      .then((data) => {
        if (!cancelled) setProject(data)
      })
      .catch((err) => {
        if (cancelled) return
        console.error("project load failed", err)
        setError(
          "Could not load project. It may not exist or you may not have permission to view it.",
        )
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, userId, fetcher])

  return { project, isLoading, error }
}
