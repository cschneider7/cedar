import {
  MessageCircleQuestionMarkIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link, useFetcher } from "react-router"
import { StudentAvatar } from "~/components/student-avatar"
import { Alert, AlertDescription } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Progress } from "~/components/ui/progress"
import { ScrollArea } from "~/components/ui/scroll-area"
import { Spinner } from "~/components/ui/spinner"
import type { ColdCall, Student } from "~/lib/schemas"
import {
  computeColdCallProbabilities,
  INITIAL_WEIGHT,
} from "~/lib/seating-chart-utils"
import { cn } from "~/lib/utils"
import type { action as coldCallAction } from "~/routes/classrooms/cold-call"

/**
 * Cold Call as a tab: same probability/pick logic as the former dialog,
 * laid out as four cards instead of dialog chrome.
 */
export function ColdCallTab({
  classroomId,
  students,
  weights,
  onWeightsChange,
}: {
  classroomId: string
  students: Student[]
  weights: Record<string, number>
  onWeightsChange: (weights: Record<string, number>) => void
}) {
  const fetcher = useFetcher<typeof coldCallAction>()
  const isSubmitting = fetcher.state !== "idle"
  const [hasPicked, setHasPicked] = useState(false)

  const studentsById = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students]
  )
  const probabilities = useMemo(
    () => computeColdCallProbabilities(students, weights),
    [students, weights]
  )

  function submit(currentWeights: Record<string, number>) {
    const payload: ColdCall = {
      students: students.map((s) => ({
        student_id: s.id,
        weight: currentWeights[s.id] ?? INITIAL_WEIGHT,
      })),
    }
    fetcher.submit(payload, {
      method: "post",
      action: `/classrooms/${classroomId}/cold-call`,
      encType: "application/json",
    })
  }

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      const nextWeights = Object.fromEntries(
        fetcher.data.pick.students.map((c) => [c.student_id, c.weight])
      )
      onWeightsChange(nextWeights)
      setHasPicked(true)
    }
  }, [fetcher.state, fetcher.data])

  const picked =
    hasPicked &&
    fetcher.data?.ok &&
    studentsById.get(fetcher.data.pick.picked_student_id)
  const pickedId = picked ? picked.id : null

  function handleReset() {
    onWeightsChange(
      Object.fromEntries(students.map((s) => [s.id, INITIAL_WEIGHT]))
    )
    setHasPicked(false)
  }

  if (students.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageCircleQuestionMarkIcon />
          </EmptyMedia>
          <EmptyTitle>No students yet</EmptyTitle>
          <EmptyDescription>
            Add students on the Roster tab before cold calling.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center gap-2">
          <Button render={<Link to={`/classrooms/${classroomId}/roster`} />}>
            Go to Roster
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {fetcher.data && !fetcher.data.ok && (
        <Alert variant="destructive" className="md:col-span-2">
          <AlertDescription>{fetcher.data.error}</AlertDescription>
        </Alert>
      )}
      <Card size="sm" className="flex h-full flex-col">
        <CardHeader>
          <CardTitle>Probabilities</CardTitle>
        </CardHeader>
        <CardContent className="flex-1">
          <ScrollArea className="h-64">
            <div className="flex flex-col gap-2 p-3 select-none">
              {probabilities.map(({ student, probability }) => (
                <div key={student.id} className="flex items-center gap-2">
                  <StudentAvatar
                    student={student}
                    className="size-6 shrink-0 rounded-full text-[9px]"
                  />
                  <span
                    className={cn(
                      "w-20 truncate text-sm",
                      student.id === pickedId && "font-semibold"
                    )}
                  >
                    {student.name}
                  </span>
                  <Progress value={probability * 100} className="flex-1" />
                  <span className="w-10 text-right text-sm text-muted-foreground tabular-nums">
                    {Math.round(probability * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
        <CardFooter className="border-t">
          <Button type="button" variant="outline" onClick={handleReset}>
            Reset
          </Button>
        </CardFooter>
      </Card>
      <Card size="sm" className="flex h-full flex-col">
        <CardHeader>
          <CardTitle>Selected Student</CardTitle>
          <CardAction className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled
              aria-label="Good pick"
            >
              <ThumbsUpIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled
              aria-label="Needs improvement"
            >
              <ThumbsDownIcon />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          {isSubmitting ? (
            <Spinner className="size-8" />
          ) : picked ? (
            <>
              <StudentAvatar
                student={picked}
                className="size-20 rounded-full text-lg"
              />
              <p className="text-lg font-medium">{picked.name}</p>
            </>
          ) : (
            <>
              <MessageCircleQuestionMarkIcon className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No student picked yet
              </p>
            </>
          )}
        </CardContent>
        <CardFooter className="border-t">
          <Button
            type="button"
            disabled={isSubmitting || students.length === 0}
            onClick={() => submit(weights)}
          >
            {isSubmitting && <Spinner />}
            {hasPicked ? "Pick Again" : "Pick Student"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
