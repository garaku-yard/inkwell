import type { FullProject } from "@/services/project"

export type ManuscriptProfile = "prose" | "poetry"

/** Export-only layout choices. They never alter the authored document. */
export interface ManuscriptSubmissionOptions {
  titlePage?: boolean
  byline?: string
  contact?: string
  runningHeader?: string
  lineSpacing?: "single" | "one-and-half" | "double"
  pageNumbers?: boolean
}

export function manuscriptSubmissionDefaults(project: FullProject, profile: ManuscriptProfile): Required<ManuscriptSubmissionOptions> {
  return {
    titlePage: profile === "prose",
    byline: "",
    contact: "",
    runningHeader: project.title,
    lineSpacing: profile === "prose" ? "double" : "one-and-half",
    pageNumbers: true,
  }
}
