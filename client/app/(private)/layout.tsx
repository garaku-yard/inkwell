import { WorkspaceProvider } from "@/lib/WorkspaceContext"

export default function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WorkspaceProvider>{children}</WorkspaceProvider>
}
