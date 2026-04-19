/**
 * Server-component layout for the `/workspace/[workspaceId]` segment. Same
 * pattern as projects/[id]: satisfies `generateStaticParams` for static export
 * with a placeholder; real ids are resolved client-side via `useParams()`.
 */
export function generateStaticParams() {
  return [{ workspaceId: "_" }];
}

export const dynamic = "force-static";

export default function WorkspaceIdLayout({ children }: { children: React.ReactNode }) {
  return children;
}
