import { scenes } from "../scenes"
import { sharedToolSpec } from "@/lib/ai/tool-contracts.generated"
import { LOCAL_USER_ID } from "../shared"
import type { ToolEntry } from "./types"

/** The index of the open project: what scenes exist, in reading order, and
 *  the ids the other scene tools need. */
export const listScenes: ToolEntry = {
  spec: sharedToolSpec("list_scenes"),
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
