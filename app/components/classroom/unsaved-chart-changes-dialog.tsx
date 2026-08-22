import { TriangleAlertIcon } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"

/**
 * Shared "you have unsaved seating chart changes" confirmation, used both by
 * real-navigation blocking and by the classroom page's own tab-switch guard.
 */
export function UnsavedChartChangesDialog({
  open,
  onOpenChange,
  onConfirmLeave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirmLeave: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm" className="select-none">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
            <TriangleAlertIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Leave and discard changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved seating chart changes. Leaving now will discard
            them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">Stay</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirmLeave}>
            Leave and discard changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
