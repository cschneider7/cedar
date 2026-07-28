export type MutationResult =
  { ok: true; id: string } | { ok: false; error: string }

export type AuthResult =
  | { ok: true }
  | { ok: false; error: string; code?: string }
