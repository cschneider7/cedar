import { zodResolver } from "@hookform/resolvers/zod"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import {
  Link,
  redirect,
  useActionData,
  useNavigation,
  useSearchParams,
  useSubmit,
} from "react-router"
import * as z from "zod"
import { Alert, AlertDescription } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "~/components/ui/input-group"
import { Spinner } from "~/components/ui/spinner"
import type { AuthResult } from "~/lib/action-results"
import { AuthApiError, getCurrentUser, login } from "~/lib/api"
import { cookieFromRequest } from "~/lib/auth"
import { LoginSchema } from "~/lib/schemas"
import type { Route } from "./+types/login"

/** Only follows `redirectTo` if it's a same-origin relative path. */
function safeRedirectTarget(redirectTo: string | null): string {
  if (
    redirectTo &&
    redirectTo.startsWith("/") &&
    !redirectTo.startsWith("//")
  ) {
    return redirectTo
  }
  return "/classrooms"
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getCurrentUser(cookieFromRequest(request))
  if (user) {
    throw redirect("/classrooms")
  }
  return null
}

export async function action({
  request,
}: Route.ActionArgs): Promise<AuthResult> {
  const rawData = await request.json()
  const result = LoginSchema.safeParse(rawData)
  if (!result.success) {
    return { ok: false, error: "Please check the form and try again." }
  }

  try {
    const { setCookie } = await login(result.data, cookieFromRequest(request))
    throw redirect(safeRedirectTarget(rawData.redirectTo ?? null), {
      headers: setCookie ? { "Set-Cookie": setCookie } : undefined,
    })
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { ok: false, error: error.message, code: error.code }
    }
    throw error
  }
}

export default function Login() {
  const [searchParams] = useSearchParams()
  const redirectTo = searchParams.get("redirectTo")
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const submit = useSubmit()
  const isSubmitting = navigation.state !== "idle"
  const [showPassword, setShowPassword] = useState(false)

  const form = useForm<z.infer<typeof LoginSchema>>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "" },
  })

  const onSubmit = (data: z.infer<typeof LoginSchema>) => {
    submit(
      { ...data, redirectTo },
      { method: "post", encType: "application/json" }
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>Welcome back to Seating Chart.</CardDescription>
      </CardHeader>
      <CardContent>
        {actionData && !actionData.ok && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{actionData.error}</AlertDescription>
          </Alert>
        )}
        <form id="login-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Email</FieldLabel>
                  <Input
                    {...field}
                    type="email"
                    autoComplete="email"
                    aria-invalid={fieldState.invalid}
                    placeholder="you@example.com"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Password</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...field}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      aria-invalid={fieldState.invalid}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-4">
        <Button type="submit" form="login-form" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          Log in
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            to={
              redirectTo
                ? `/signup?redirectTo=${encodeURIComponent(redirectTo)}`
                : "/signup"
            }
            className="text-primary underline-offset-4 hover:underline"
          >
            Sign up
          </Link>
        </p>
        <p className="text-center text-sm">
          <Link
            to="/forgot-password"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Forgot your password?
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
