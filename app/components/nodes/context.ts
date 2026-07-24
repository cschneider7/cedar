import { createContext } from "react"

export const LockedContext = createContext(false)

export type Boundary = { width: number; height: number }

export const BoundaryContext = createContext<Boundary>({
  width: 0,
  height: 0,
})
