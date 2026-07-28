import { Outlet } from "react-router"
import { AppSidebar } from "~/components/app-sidebar"
import { AppTopbar } from "~/components/app-topbar"
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar"

/** Persistent topbar/sidebar chrome for the main app — deliberately not
 * wrapping the auth routes, which render as standalone pages. */
export default function AppShell() {
  return (
    <SidebarProvider className="min-h-0 flex-1 flex-col">
      <AppTopbar />
      <div className="flex min-h-0 flex-1">
        <AppSidebar />
        <SidebarInset className="min-h-0">
          <Outlet />
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
