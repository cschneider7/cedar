import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
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
import { Field, FieldError, FieldGroup } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Spinner } from "~/components/ui/spinner"
import { toast } from "~/components/ui/toast"
import { createSupabaseBrowserClient } from "~/lib/supabase/client"
import { supabaseContext } from "~/lib/supabase/context"
import { requireAuthMiddleware } from "~/middleware/require-auth"
import type { Route } from "./+types/account"

export const middleware: Route.MiddlewareFunction[] = [requireAuthMiddleware]

export function meta({}: Route.MetaArgs) {
  return [{ title: "Account - Cedar" }]
}

export function loader({ context }: Route.LoaderArgs) {
  const { user } = context.get(supabaseContext)
  return {
    email: user!.email ?? "",
    name: (user!.user_metadata?.name as string | undefined) ?? "",
  }
}

const NameSchema = z.object({ name: z.string().min(1, "Name is required") })
const EmailSchema = z.object({ email: z.email("Enter a valid email address") })
const PasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })

function UpdateNameCard({ defaultName }: { defaultName: string }) {
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const form = useForm<z.infer<typeof NameSchema>>({
    resolver: zodResolver(NameSchema),
    defaultValues: { name: defaultName },
  })

  const onSubmit = async (data: z.infer<typeof NameSchema>) => {
    setError(null)
    setIsSubmitting(true)
    const { error } = await createSupabaseBrowserClient().auth.updateUser({
      data: { name: data.name },
    })
    setIsSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    toast.add({ title: "Name updated.", type: "success" })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Name</CardTitle>
        <CardDescription>Your display name.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form id="name-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <Input {...field} aria-invalid={fieldState.invalid} />
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
        <Button type="submit" form="name-form" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          Save
        </Button>
      </CardFooter>
    </Card>
  )
}

function ChangeEmailCard({ defaultEmail }: { defaultEmail: string }) {
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const form = useForm<z.infer<typeof EmailSchema>>({
    resolver: zodResolver(EmailSchema),
    defaultValues: { email: defaultEmail },
  })

  const onSubmit = async (data: z.infer<typeof EmailSchema>) => {
    setError(null)
    setIsSubmitting(true)
    const { error } = await createSupabaseBrowserClient().auth.updateUser({
      email: data.email,
    })
    setIsSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setSubmitted(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email</CardTitle>
        <CardDescription>
          Changing your email sends a confirmation link to the new address.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {submitted && (
          <Alert className="mb-4">
            <AlertDescription>
              Check your new email address for a confirmation link.
            </AlertDescription>
          </Alert>
        )}
        <form id="email-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <Input
                    {...field}
                    type="email"
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
        <Button type="submit" form="email-form" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          Save
        </Button>
      </CardFooter>
    </Card>
  )
}

function ChangePasswordCard() {
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const form = useForm<z.infer<typeof PasswordSchema>>({
    resolver: zodResolver(PasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  })

  const onSubmit = async (data: z.infer<typeof PasswordSchema>) => {
    setError(null)
    setIsSubmitting(true)
    const { error } = await createSupabaseBrowserClient().auth.updateUser({
      password: data.password,
    })
    setIsSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    form.reset()
    toast.add({ title: "Password updated.", type: "success" })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Change your account password.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form id="password-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <Input
                    {...field}
                    type="password"
                    autoComplete="new-password"
                    placeholder="New password"
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
                  <Input
                    {...field}
                    type="password"
                    autoComplete="new-password"
                    placeholder="Confirm new password"
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
        <Button type="submit" form="password-form" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          Save
        </Button>
      </CardFooter>
    </Card>
  )
}

export default function Account({ loaderData }: Route.ComponentProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold">Account</h1>
          <p className="text-sm text-muted-foreground">
            Manage your profile and password.
          </p>
        </div>
        <UpdateNameCard defaultName={loaderData.name} />
        <ChangeEmailCard defaultEmail={loaderData.email} />
        <ChangePasswordCard />
      </div>
    </div>
  )
}
