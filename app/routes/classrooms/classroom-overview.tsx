import { OverviewTab } from "~/components/classroom/overview-tab"
import { useClassroomData } from "~/lib/classroom-route-data"

export default function Component() {
  const { classroom, students, seatingChart } = useClassroomData()
  return (
    <OverviewTab
      classroomId={classroom.id}
      students={students}
      seatingChart={seatingChart}
    />
  )
}
