import { zodResolver } from "@hookform/resolvers/zod"
import { MailCheckIcon } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { Link, useActionData, useNavigation, useSubmit } from "react-router"
import * as z from "zod"
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
import { Spinner } from "~/components/ui/spinner"
import type { AuthResult } from "~/lib/action-results"
import { forgotPassword } from "~/lib/api"
import { cookieFromRequest } from "~/lib/auth"
import { ForgotPasswordSchema } from "~/lib/schemas"
import type { Route } from "./+types/forgot-password"

export async function action({
  request,
}: Route.ActionArgs): Promise<AuthResult> {
  const rawData = await request.json()
  const result = ForgotPasswordSchema.safeParse(rawData)
  if (!result.success) {
    return { ok: false, error: "Please check the form and try again." }
  }

  // Always the same outcome regardless of whether the email exists — the
  // backend never leaks account existence, and neither should this page.
  await forgotPassword(result.data.email, cookieFromRequest(request))
  return { ok: true }
}

export default function ForgotPassword() {
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const submit = useSubmit()
  const isSubmitting = navigation.state !== "idle"

  const form = useForm<z.infer<typeof ForgotPasswordSchema>>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: "" },
  })

  const onSubmit = (data: z.infer<typeof ForgotPasswordSchema>) => {
    submit(data, { method: "post", encType: "application/json" })
  }

  if (actionData?.ok) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <MailCheckIcon className="mb-2 size-8 text-primary" />
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            If that email is registered, a reset link has been sent.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button render={<Link to="/login" />} className="w-full">
            Back to log in
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Forgot password</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a reset link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form id="forgot-password-form" onSubmit={form.handleSubmit(onSubmit)}>
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
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-4">
        <Button
          type="submit"
          form="forgot-password-form"
          disabled={isSubmitting}
        >
          {isSubmitting && <Spinner />}
          Send reset link
        </Button>
        <p className="text-center text-sm">
          <Link
            to="/login"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to log in
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
