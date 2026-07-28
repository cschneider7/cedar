import { redirect } from "react-router"
import { logout } from "~/lib/api"
import { cookieFromRequest } from "~/lib/auth"
import type { Route } from "./+types/logout"

export async function action({ request }: Route.ActionArgs) {
  const { setCookie } = await logout(cookieFromRequest(request))
  return redirect("/", {
    headers: setCookie ? { "Set-Cookie": setCookie } : undefined,
  })
}
