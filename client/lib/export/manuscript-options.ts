import type { FullProject } from "@/services/project"
import type { ProsePaperSize } from "@/lib/editor/prose-paper"

export type ManuscriptProfile = "prose" | "poetry"

/** Export-only layout choices. They never alter the authored document. */
export interface ManuscriptSubmissionOptions {
  titlePage?: boolean
  byline?: string
  contact?: string
  runningHeader?: string
  lineSpacing?: "single" | "one-and-half" | "double"
  pageNumbers?: boolean
  paperSize?: ProsePaperSize
  coverImage?: string
  coverAspectRatio?: number
}

export function manuscriptSubmissionDefaults(project: FullProject, profile: ManuscriptProfile): Required<ManuscriptSubmissionOptions> {
  return {
    titlePage: profile === "prose",
    byline: "",
    contact: "",
    runningHeader: project.title,
    lineSpacing: profile === "prose" ? "double" : "one-and-half",
    pageNumbers: true,
    paperSize: "letter",
    coverImage: "",
    coverAspectRatio: 1,
  }
}
