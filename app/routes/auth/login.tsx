import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { Link, useNavigate, useSearchParams } from "react-router"
import * as z from "zod"
import { GoogleIcon } from "~/components/google-icon"
import { PasswordInput } from "~/components/password-input"
import { Alert, AlertDescription } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Spinner } from "~/components/ui/spinner"
import { isPreviewEnv } from "~/middleware/preview-auth-gate"
import { createSupabaseBrowserClient } from "~/lib/supabase/client"
import type { Route } from "./+types/login"

const LoginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
})

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_denied: "Google sign-in was cancelled.",
  oauth_failed: "Google sign-in failed. Please try again.",
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Log In - Cedar" }]
}

export function loader() {
  return { isPreview: isPreviewEnv() }
}

export default function Login({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(
    OAUTH_ERROR_MESSAGES[searchParams.get("error") ?? ""] ?? null
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<z.infer<typeof LoginSchema>>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "" },
  })

  const onSubmit = async (data: z.infer<typeof LoginSchema>) => {
    setError(null)
    setIsSubmitting(true)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithPassword(data)
    setIsSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate("/")
  }

  const handleGoogleSignIn = async () => {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Log in</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form id="login-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    {...field}
                    id="email"
                    type="email"
                    autoComplete="email"
                    aria-invalid={fieldState.invalid}
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
                  <div className="flex items-center justify-between">
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <Link
                      to="/forgot-password"
                      className="text-sm text-muted-foreground underline underline-offset-4 hover:text-primary"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <PasswordInput
                    {...field}
                    id="password"
                    autoComplete="current-password"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              Log in
            </Button>
            {!loaderData.isPreview && (
              <>
                <FieldSeparator>or</FieldSeparator>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleGoogleSignIn}
                >
                  <GoogleIcon />
                  Continue with Google
                </Button>
              </>
            )}
          </FieldGroup>
        </form>
      </CardContent>
      {!loaderData.isPreview && (
        <CardFooter className="flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              to="/signup"
              className="underline underline-offset-4 hover:text-primary"
            >
              Sign up
            </Link>
          </p>
        </CardFooter>
      )}
    </Card>
  )
}
