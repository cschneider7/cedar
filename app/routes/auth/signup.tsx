import { zodResolver } from "@hookform/resolvers/zod"
import { EyeIcon, EyeOffIcon, MailCheckIcon } from "lucide-react"
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
import {
  AuthApiError,
  getCurrentUser,
  resendVerificationEmail,
  signup,
} from "~/lib/api"
import { cookieFromRequest } from "~/lib/auth"
import { SignupSchema } from "~/lib/schemas"
import type { Route } from "./+types/signup"

type SignupResult = { ok: true; email: string } | { ok: false; error: string }

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getCurrentUser(cookieFromRequest(request))
  if (user) {
    throw redirect("/classrooms")
  }
  return null
}

export async function action({
  request,
}: Route.ActionArgs): Promise<SignupResult> {
  const rawData = await request.json()

  if (rawData.intent === "resend") {
    if (typeof rawData.email === "string") {
      await resendVerificationEmail(rawData.email, cookieFromRequest(request))
    }
    return { ok: true, email: rawData.email }
  }

  const result = SignupSchema.safeParse(rawData)
  if (!result.success) {
    return { ok: false, error: "Please check the form and try again." }
  }

  try {
    const user = await signup(result.data, cookieFromRequest(request))
    return { ok: true, email: user.email }
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { ok: false, error: error.message }
    }
    throw error
  }
}

export default function Signup() {
  const [searchParams] = useSearchParams()
  const redirectTo = searchParams.get("redirectTo")
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const submit = useSubmit()
  const isSubmitting = navigation.state !== "idle"
  const [showPassword, setShowPassword] = useState(false)

  const form = useForm<z.infer<typeof SignupSchema>>({
    resolver: zodResolver(SignupSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  })

  const onSubmit = (data: z.infer<typeof SignupSchema>) => {
    submit(data, { method: "post", encType: "application/json" })
  }

  const resend = () => {
    if (actionData?.ok) {
      submit(
        { intent: "resend", email: actionData.email },
        { method: "post", encType: "application/json" }
      )
    }
  }

  if (actionData?.ok) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <MailCheckIcon className="mb-2 size-8 text-primary" />
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a verification link to <strong>{actionData.email}</strong>.
            Click it to activate your account, then log in.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col items-stretch gap-4">
          <Button variant="outline" disabled={isSubmitting} onClick={resend}>
            {isSubmitting && <Spinner />}
            Resend verification email
          </Button>
          <p className="text-center text-sm">
            <Link
              to="/login"
              className="text-primary underline-offset-4 hover:underline"
            >
              Back to log in
            </Link>
          </p>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign up</CardTitle>
        <CardDescription>Create your Seating Chart account.</CardDescription>
      </CardHeader>
      <CardContent>
        {actionData && !actionData.ok && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{actionData.error}</AlertDescription>
          </Alert>
        )}
        <form id="signup-form" onSubmit={form.handleSubmit(onSubmit)}>
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
                  <FieldLabel>Confirm password</FieldLabel>
                  <Input
                    {...field}
                    type={showPassword ? "text" : "password"}
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
      <CardFooter className="flex flex-col items-stretch gap-4">
        <Button type="submit" form="signup-form" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          Sign up
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            to={
              redirectTo
                ? `/login?redirectTo=${encodeURIComponent(redirectTo)}`
                : "/login"
            }
            className="text-primary underline-offset-4 hover:underline"
          >
            Log in
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
