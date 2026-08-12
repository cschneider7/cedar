import { useEffect, useState } from "react"
import { useNavigation } from "react-router"
import { Spinner } from "~/components/ui/spinner"

const SHOW_DELAY_MS = 150

/**
 * Small spinner shown during any client-side navigation, delayed briefly
 * so fast navigations don't flash it. Rendered inline in the topbar, to
 * the left of the search bar.
 */
export function NavLoadingIndicator() {
  const navigation = useNavigation()
  const isNavigating = navigation.state !== "idle"
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isNavigating) {
      setVisible(false)
      return
    }
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    return () => clearTimeout(timer)
  }, [isNavigating])

  if (!visible) {
    return null
  }

  return (
    <div className="pointer-events-none">
      <Spinner className="size-5" />
    </div>
  )
}
