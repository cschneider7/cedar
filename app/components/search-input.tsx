import { Search } from "lucide-react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "~/components/ui/input-group"

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  "aria-label": ariaLabel = "Search",
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  "aria-label"?: string
  className?: string
}) {
  return (
    <InputGroup className={className ?? "max-w-xs"}>
      <InputGroupInput
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
    </InputGroup>
  )
}
