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
  // Static exports cannot guess at trailing slashes per-route, so force the
  // same rule everywhere to avoid 404s when users open /dashboard vs
  // /dashboard/ under Tauri.
  trailingSlash: isTauri,
};

export default nextConfig;
