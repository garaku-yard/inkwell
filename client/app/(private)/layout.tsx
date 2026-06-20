import { WorkspaceProvider } from "@/lib/WorkspaceContext"
import { SyncRunner } from "@/components/sync/SyncRunner"

export default function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider>
      <SyncRunner />
      {children}
    </WorkspaceProvider>
  )
}
