import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { redirect, useNavigate } from "react-router"
import * as z from "zod"
import { AuthPageLayout } from "~/components/auth-page-layout"
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
import { toast } from "~/components/ui/toast"
import { createSupabaseBrowserClient } from "~/lib/supabase/client"
import { supabaseContext } from "~/lib/supabase/context"
import { previewAuthGateMiddleware } from "~/middleware/preview-auth-gate"
import type { Route } from "./+types/reset-password"

export const middleware: Route.MiddlewareFunction[] = [
  previewAuthGateMiddleware,
]

const ResetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })

export function meta({}: Route.MetaArgs) {
  return [{ title: "Reset Password - Cedar" }]
}

export function loader({ context }: Route.LoaderArgs) {
  // Only reachable with an active session, established by /auth/callback's
  // recovery-code exchange — otherwise there's nothing to reset.
  const { user } = context.get(supabaseContext)
  if (!user) {
    throw redirect("/forgot-password")
  }
  return null
}

export default function ResetPassword() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<z.infer<typeof ResetPasswordSchema>>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  })

  const onSubmit = async (data: z.infer<typeof ResetPasswordSchema>) => {
    setError(null)
    setIsSubmitting(true)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.updateUser({
      password: data.password,
    })
    setIsSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    toast.add({ title: "Password updated.", type: "success" })
    navigate("/")
  }

  return (
    <AuthPageLayout>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset password</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form id="reset-password-form" onSubmit={form.handleSubmit(onSubmit)}>
            <FieldGroup>
              <Controller
                name="password"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="password">New password</FieldLabel>
                    <Input
                      {...field}
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                name="confirmPassword"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="confirm-password">
                      Confirm new password
                    </FieldLabel>
                    <Input
                      {...field}
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
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
        <CardFooter>
          <Button
            type="submit"
            form="reset-password-form"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting && <Spinner />}
            Reset password
          </Button>
        </CardFooter>
      </Card>
    </AuthPageLayout>
  )
}
