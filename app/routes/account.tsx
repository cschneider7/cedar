import { AccountSettingsCards, ChangePasswordCard } from "@neondatabase/auth-ui"
import { NeonAuthUI } from "~/components/neon-auth-ui-provider"
import { RequireAuth } from "~/components/require-auth"
import type { Route } from "./+types/account"

export function meta({}: Route.MetaArgs) {
  return [{ title: "Account - Cedar" }]
}

// Neon Auth doesn't currently support changing a signed-up email address
// (see NeonAuthUI's `changeEmail={false}`) — name/password only for now.
export default function Account() {
  return (
    <RequireAuth>
      <div className="h-full min-h-0 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
          <div>
            <h1 className="text-2xl font-semibold">Account</h1>
            <p className="text-sm text-muted-foreground">
              Manage your profile and password.
            </p>
          </div>
          <NeonAuthUI>
            <AccountSettingsCards />
            <ChangePasswordCard />
          </NeonAuthUI>
        </div>
      </div>
    </RequireAuth>
  )
}
