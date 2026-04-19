/**
 * Server-component layout for the `/projects/[id]` segment. Its only job is
 * to own `generateStaticParams`, which the Tauri build (`output: "export"`)
 * requires on every dynamic route. We return a single placeholder id so
 * Next.js emits the route's JS bundle and stub HTML; runtime navigation uses
 * the client router, and pages read the real id from `useParams()`.
 */
export function generateStaticParams() {
  return [{ id: "_" }];
}

export const dynamic = "force-static";

export default function ProjectIdLayout({ children }: { children: React.ReactNode }) {
  return children;
}
