import { invoke } from "@tauri-apps/api/core"

/**
 * Runtime filesystem-scope grants for the desktop build.
 *
 * The Tauri app ships with no broad static fs/asset scope (see
 * src-tauri/capabilities + tauri.conf), so the webview can only read/write the
 * specific directories it asks for at runtime. Call {@link allowFsDir} with a
 * path before touching it via @tauri-apps/plugin-fs or loading it through the
 * asset protocol — typically the vault folder (recursive) or the directory of
 * a file the user chose to import (non-recursive).
 *
 * Grants are cached per session so repeated calls (every vault open, every
 * note read) are cheap no-ops after the first.
 */
const granted = new Set<string>()

/**
 * Grants the running process read/write + asset access to `path`. Resolves
 * immediately if the same (path, recursive) pair was already granted this
 * session. Throws if the Rust command rejects the path.
 *
 * @param path - Absolute directory path to allow.
 * @param recursive - Allow the whole subtree (true, vault) or just direct
 *   children (false, an import file's folder). Defaults to recursive.
 */
export async function allowFsDir(path: string, recursive = true): Promise<void> {
  if (!path) return
  const cacheKey = `${recursive ? "r" : "1"}:${path}`
  if (granted.has(cacheKey)) return
  await invoke("allow_fs_dir", { path, recursive })
  granted.add(cacheKey)
}
