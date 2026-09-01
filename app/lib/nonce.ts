import { createContext, useContext } from "react"

/**
 * The per-response CSP nonce, provided by `entry.server.tsx` during SSR so
 * inline `<script>` elements we don't control (e.g. `next-themes`' anti-flash
 * script) can be allow-listed. Empty on the client, where it isn't needed.
 */
export const NonceContext = createContext<string>("")

export function useNonce(): string {
  return useContext(NonceContext)
}
