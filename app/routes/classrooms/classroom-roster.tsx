import { RosterTab } from "~/components/classroom/roster-tab"
import { useClassroomData } from "~/lib/classroom-route-data"

export default function Component() {
  const { classroom, students, eligibleStudents, separations } =
    useClassroomData()
  return (
    <RosterTab
      classroomId={classroom.id}
      students={students}
      eligibleStudents={eligibleStudents}
      separations={separations}
    />
  )
}
