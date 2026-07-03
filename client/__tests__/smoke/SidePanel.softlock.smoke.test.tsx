import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"

import { SidePanel } from "@/components/editor/SidePanel"
import type { FullProject, Scene } from "@/services/project"
import type { Peer } from "@/lib/realtime/protocol"

function scene(id: string, heading: string): Scene {
  return {
    id,
    project_id: "p1",
    scene_heading: heading,
    content: "",
    order_index: 0,
    elements: [],
    created_at: "",
    updated_at: "",
  }
}

function peer(userId: string, name: string, elementId: string): Peer {
  return { connId: `c-${userId}`, userId, name, elementId }
}

const scenes = [scene("s1", "INT. HOUSE"), scene("s2", "EXT. STREET")]

const project = {
  id: "p1",
  title: "Test Script",
  category: "screenplay",
  scenes,
} as unknown as FullProject

function renderPanel(peersByScene?: Map<string, Peer[]>) {
  return render(
    <SidePanel
      project={project}
      allScenes={scenes}
      totalScenes={scenes.length}
      totalElements={0}
      onScrollToElement={() => {}}
      activeElementId={null}
      peersByScene={peersByScene}
      comments={[]}
      onAddComment={() => {}}
      onUpdateComment={() => {}}
      onDeleteComment={() => {}}
      onToggleCommentResolved={() => {}}
    />,
  )
}

describe("SidePanel soft-lock pips — smoke", () => {
  it("shows a soft-lock pip on the scene a collaborator is editing", () => {
    const { getByLabelText } = renderPanel(new Map([["s1", [peer("u2", "Ada", "s1")]]]))
    expect(getByLabelText(/Ada is editing/i)).toBeInTheDocument()
  })

  it("renders no pips when no collaborators are present", () => {
    const { queryByLabelText } = renderPanel(new Map())
    expect(queryByLabelText(/is editing/i)).toBeNull()
  })

  it("tolerates an absent peersByScene map", () => {
    const { queryByLabelText } = renderPanel(undefined)
    expect(queryByLabelText(/is editing/i)).toBeNull()
  })
})
