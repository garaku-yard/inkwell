import type { FullProject } from "@/services/project"
import { editorHtmlToInline, plainInlineText, readInlineRuns } from "@/lib/editor/inline-content"

// Maps our element types to Final Draft paragraph types
const FDX_TYPE: Record<string, string> = {
  ACTION:        "Action",
  TEXT:          "Action",
  CHARACTER:     "Character",
  PARENTHETICAL: "Parenthetical",
  DIALOG:        "Dialogue",
  DIALOGUE:      "Dialogue",
  TRANSITION:    "Transition",
  SHOT:          "Shot",
  NEW_ACT:       "Act Break",
  END_ACT:       "Act Break",
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function fdxRuns(content: string): string {
  return readInlineRuns(editorHtmlToInline(content)).map(run => {
    const styles = [run.strong && "Bold", run.emphasis && "Italic", run.underline && "Underline"].filter(Boolean)
    return `<Text${styles.length ? ` Style="${styles.join("+")}"` : ""}>${escapeXml(run.text)}</Text>`
  }).join("")
}

const plainScreenplayText = (content: string) => plainInlineText(editorHtmlToInline(content))

export function buildScreenplayFdx(project: FullProject): string {
  const scenes = [...(project.scenes ?? [])].sort((a, b) => a.order_index - b.order_index)

  const paragraphs: string[] = []

  for (const scene of scenes) {
    // Scene heading
    paragraphs.push(
      `    <Paragraph Type="Scene Heading">`,
      `      <Text>${escapeXml(plainScreenplayText(scene.scene_heading || "SCENE"))}</Text>`,
      `    </Paragraph>`,
    )

    const elements = [...(scene.elements ?? [])].sort(
      (a, b) => a.line_number - b.line_number,
    )

    for (const el of elements) {
      const content = el.content?.trim()
      if (!content) continue

      // Skip purely editorial types
      if (el.element_type === "NOTE" || el.element_type === "OUTLINE") continue

      const fdxType = FDX_TYPE[el.element_type]
      if (!fdxType) continue

      const text =
        el.element_type === "PARENTHETICAL"
          ? `(${content.replace(/^\(|\)$/g, "")})`
          : content

      paragraphs.push(
        `    <Paragraph Type="${fdxType}"${el.element_type === "END_ACT" ? ' InkwellType="END_ACT"' : ""}>`,
        `      ${fdxRuns(text)}`,
        `    </Paragraph>`,
      )
    }
  }

  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>`,
    `<FinalDraft DocumentType="Script" Template="No" Version="5">`,
    `  <Content>`,
    ...paragraphs,
    `  </Content>`,
    `  <TitlePage>`,
    `    <Content>`,
    `      <Paragraph>`,
    `        <Text>${escapeXml(project.title)}</Text>`,
    `      </Paragraph>`,
    `    </Content>`,
    `  </TitlePage>`,
    `  <Header FooterFirstPageNumber="2" HeaderAndFooterVisibility="0" StartingPageNumber="1">`,
    `  </Header>`,
    `  <Footer>`,
    `  </Footer>`,
    `</FinalDraft>`,
  ].join("\n")
}

export function exportScreenplayToFDX(project: FullProject): void {
  const fdx = buildScreenplayFdx(project)
  const blob = new Blob([fdx], { type: "application/xml" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${project.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.fdx`
  a.click()
  URL.revokeObjectURL(url)
}
