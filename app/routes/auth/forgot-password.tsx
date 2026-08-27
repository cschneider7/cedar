import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { Link } from "react-router"
import * as z from "zod"
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
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Spinner } from "~/components/ui/spinner"
import { createSupabaseBrowserClient } from "~/lib/supabase/client"
import { previewAuthGateMiddleware } from "~/middleware/preview-auth-gate"
import type { Route } from "./+types/forgot-password"

export const middleware: Route.MiddlewareFunction[] = [
  previewAuthGateMiddleware,
]

const ForgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address"),
})

export function meta({}: Route.MetaArgs) {
  return [{ title: "Forgot Password - Cedar" }]
}

export default function ForgotPassword() {
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const form = useForm<z.infer<typeof ForgotPasswordSchema>>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: "" },
  })

  const onSubmit = async (data: z.infer<typeof ForgotPasswordSchema>) => {
    setError(null)
    setIsSubmitting(true)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    })
    setIsSubmitting(false)
    // Always show the generic success state, even on error, so this can't
    // be used to enumerate which emails have an account.
    if (error) {
      setError(null)
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            If an account exists for that email, we sent a link to reset your
            password.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Forgot password</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form id="forgot-password-form" onSubmit={form.handleSubmit(onSubmit)}>
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
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="flex-col gap-4">
        <Button
          type="submit"
          form="forgot-password-form"
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting && <Spinner />}
          Send reset link
        </Button>
        <p className="text-sm text-muted-foreground">
          <Link
            to="/login"
            className="underline underline-offset-4 hover:text-primary"
          >
            Back to log in
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
