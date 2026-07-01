import { WorkspaceProvider } from "@/lib/WorkspaceContext"
import { SyncRunner } from "@/components/sync/SyncRunner"
import { UserNotificationsListener } from "@/components/notifications/UserNotificationsListener"

export default function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider>
      <SyncRunner />
      <UserNotificationsListener />
      {children}
    </WorkspaceProvider>
  )
}
