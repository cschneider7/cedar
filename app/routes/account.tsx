import { AccountSettingsCards, ChangePasswordCard } from "@neondatabase/auth-ui"
import { RedirectToSignIn, SignedIn } from "@neondatabase/auth/react"
import type { Route } from "./+types/account"

export function meta({}: Route.MetaArgs) {
  return [{ title: "Account - Cedar" }]
}

export default function Account() {
  return (
    <>
      <RedirectToSignIn />
      <SignedIn>
        <div className="h-full min-h-0 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
            <div>
              <h1 className="text-2xl font-semibold">Account</h1>
              <p className="text-sm text-muted-foreground">
                Manage your profile and password.
              </p>
            </div>
            <AccountSettingsCards />
            <ChangePasswordCard />
          </div>
        </div>
      </SignedIn>
    </>
  )
}
