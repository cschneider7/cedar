import { zodResolver } from "@hookform/resolvers/zod"
import { CheckCircle2Icon, EyeIcon, EyeOffIcon } from "lucide-react"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import {
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "~/components/ui/input-group"
import { Spinner } from "~/components/ui/spinner"
import type { AuthResult } from "~/lib/action-results"
import { AuthApiError, resetPassword } from "~/lib/api"
import { cookieFromRequest } from "~/lib/auth"
import { ResetPasswordSchema } from "~/lib/schemas"
import type { Route } from "./+types/reset-password"

export async function loader({ request }: Route.LoaderArgs) {
  // Intentionally not pre-validated - that would leak token validity before
  // the user even submits the form.
  const token = new URL(request.url).searchParams.get("token") ?? ""
  return { token }
}

export async function action({
  request,
}: Route.ActionArgs): Promise<AuthResult> {
  const rawData = await request.json()
  const result = ResetPasswordSchema.safeParse(rawData)
  if (!result.success) {
    return { ok: false, error: "Please check the form and try again." }
  }

  try {
    await resetPassword(
      { token: result.data.token, password: result.data.password },
      cookieFromRequest(request)
    )
    return { ok: true }
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { ok: false, error: error.message }
    }
    throw error
  }
}

export default function ResetPassword() {
  const { token } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const submit = useSubmit()
  const isSubmitting = navigation.state !== "idle"
  const [showPassword, setShowPassword] = useState(false)

  const form = useForm<z.infer<typeof ResetPasswordSchema>>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { token, password: "", confirmPassword: "" },
  })

  const onSubmit = (data: z.infer<typeof ResetPasswordSchema>) => {
    submit(data, { method: "post", encType: "application/json" })
  }

  if (actionData?.ok) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CheckCircle2Icon className="mb-2 size-8 text-primary" />
          <CardTitle>Password reset</CardTitle>
          <CardDescription>
            Your password has been reset. Log in with your new password.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button render={<Link to="/login" />} className="w-full">
            Log in
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
        <CardDescription>Choose a new password.</CardDescription>
      </CardHeader>
      <CardContent>
        {actionData && !actionData.ok && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>
              {actionData.error}{" "}
              <Link to="/forgot-password" className="underline">
                Request a new one
              </Link>
              .
            </AlertDescription>
          </Alert>
        )}
        <form id="reset-password-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>New password</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...field}
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
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
            <Controller
              name="confirmPassword"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Confirm new password</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...field}
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      aria-invalid={fieldState.invalid}
                    />
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
      <CardFooter>
        <Button
          type="submit"
          form="reset-password-form"
          disabled={isSubmitting}
          className="w-full"
        >
          {isSubmitting && <Spinner />}
          Reset password
        </Button>
      </CardFooter>
    </Card>
  )
}
