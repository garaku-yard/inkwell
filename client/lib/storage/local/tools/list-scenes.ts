import { scenes } from "../scenes"
import { LOCAL_USER_ID } from "../shared"
import type { ToolEntry } from "./types"

/** The index of the open project: what scenes exist, in reading order, and
 *  the ids the other scene tools need. */
export const listScenes: ToolEntry = {
  spec: {
    name: "list_scenes",
    description:
      "List the scenes of the project this conversation is open on, in " +
      "reading order, with the id needed to read one. Call this first when " +
      "you need a scene id, or to get your bearings in the manuscript.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  mutates: false,
  label: () => "Listing scenes",
  async run(_args, ctx) {
    const list = await scenes.listForProject(ctx.projectId, LOCAL_USER_ID)
    if (list.length === 0) return "This project has no scenes yet."
    return list
      .map(
        (scene, i) =>
          `${i + 1}. ${scene.scene_heading || "(untitled)"} (id ${scene.id})`,
      )
      .join("\n")
  },
}
