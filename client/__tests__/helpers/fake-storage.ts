import { setStorage, type Capability, type Storage } from "@/lib/storage"

/** Builds a "screaming proxy" — every property access returns a function
 *  that throws with the name of the slot. Used to stub Storage sub-
 *  interfaces in smoke tests so any unmocked call fails loudly with the
 *  exact path it tried to reach, instead of a quiet `undefined is not a
 *  function`. Tests override only the slots they actually exercise. */
function makeScreamingProxy<T extends object>(name: string): T {
  return new Proxy({} as T, {
    get(_, key) {
      const path = `${name}.${String(key)}`
      return () => {
        throw new Error(
          `fake-storage: ${path} was called but not stubbed in this test. ` +
            `Pass an override into installFakeStorage({ ... }).`,
        )
      }
    },
  })
}

/** Binds a fake Storage for the duration of the test. Defaults are
 *  empty screaming proxies so tests fail with a clear message if they
 *  reach for an unmocked slot. Pass overrides to stub the bits a given
 *  test actually exercises. */
export function installFakeStorage(overrides: Partial<Storage> = {}): Storage {
  const capabilities: ReadonlySet<Capability> =
    overrides.capabilities ?? new Set<Capability>(["ai.byo"])
  const stub: Storage = {
    capabilities,
    auth: makeScreamingProxy("auth"),
    projects: makeScreamingProxy("projects"),
    scenes: makeScreamingProxy("scenes"),
    elements: makeScreamingProxy("elements"),
    characters: makeScreamingProxy("characters"),
    locations: makeScreamingProxy("locations"),
    beatBoard: makeScreamingProxy("beatBoard"),
    workspaces: makeScreamingProxy("workspaces"),
    collaboration: makeScreamingProxy("collaboration"),
    notifications: makeScreamingProxy("notifications"),
    settings: makeScreamingProxy("settings"),
    vault: makeScreamingProxy("vault"),
    knowledge: makeScreamingProxy("knowledge"),
    ai: makeScreamingProxy("ai"),
    billing: makeScreamingProxy("billing"),
    admin: { billing: makeScreamingProxy("admin.billing") },
    sync: makeScreamingProxy("sync"),
    ...overrides,
  }
  setStorage(stub)
  return stub
}
