import type { NextConfig } from "next";

/**
 * Two build targets share this config:
 *
 * - Default (web): `output: "standalone"` so the Docker image can `next start`
 *   and talk to the Go gateway.
 * - Tauri (desktop): `BUILD_TARGET=tauri` flips to `output: "export"`, which
 *   emits a fully static `client/out/` directory that Tauri packages into the
 *   desktop binary. No Node server runs on the user's machine.
 *
 * Static export disables a few Next.js features — dynamic route params that
 * aren't pre-rendered, `next/image` optimisation, and anything relying on
 * server actions. Tauri builds work around `next/image` by disabling the
 * optimiser; the rest of the app is already client-rendered so nothing else
 * needs to change today.
 */
const isTauri = process.env.BUILD_TARGET === "tauri";

const nextConfig: NextConfig = {
  output: isTauri ? "export" : "standalone",
  images: isTauri ? { unoptimized: true } : undefined,
  // Next 16 defaults to spawning `tsc --showConfig` and parsing its stdout.
  // Some desktop build environments lose that piped stdout even though the
  // compiler exits successfully. The in-process compiler API performs the same
  // type check without depending on a child-process pipe.
  experimental: { useTypeScriptCli: false },
  // Build-time app metadata, surfaced in Settings → About. Version comes from
  // package.json (npm sets npm_package_version when running scripts) so it
  // auto-tracks releases instead of being hand-maintained in the UI.
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? "0.0.0-dev",
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString().slice(0, 10),
    // The repository's local web environment points at localhost. Expose the
    // build target so the packaged desktop app can still choose the hosted
    // gateway as its safe default instead of baking in that development URL.
    NEXT_PUBLIC_BUILD_TARGET: isTauri ? "tauri" : "web",
  },
  // Static exports cannot guess at trailing slashes per-route, so force the
  // same rule everywhere to avoid 404s when users open /dashboard vs
  // /dashboard/ under Tauri.
  trailingSlash: isTauri,
};

export default nextConfig;
