import {
  type RouteConfig,
  index,
  layout,
  prefix,
  route,
} from "@react-router/dev/routes"

export default [
  route("login", "routes/auth/login.tsx"),
  route("signup", "routes/auth/signup.tsx"),
  route("api/student-image-upload", "routes/api/student-image-upload.tsx"),
  route("api/student-image", "routes/api/student-image.tsx"),
  route("api/quick-search", "routes/api/quick-search.tsx"),
  layout("layouts/app-shell.tsx", [
    index("routes/home.tsx"),

    ...prefix("students", [
      layout("layouts/students.tsx", [
        index("routes/students/student-home.tsx"),
        route("new", "routes/students/create-student.tsx"),
        route(":studentId", "routes/students/student.tsx"),
        route(":studentId/edit", "routes/students/edit-student.tsx"),
        route(":studentId/delete", "routes/students/delete-student.tsx"),
        route("bulk-delete", "routes/students/bulk-delete-students.tsx"),
        route("bulk-unassign", "routes/students/bulk-unassign-students.tsx"),
      ]),
    ]),

    ...prefix("classrooms", [
      layout("layouts/classrooms.tsx", [
        index("routes/classrooms/classroom-home.tsx"),
        route("new", "routes/classrooms/create-classroom.tsx"),
        route(
          ":classroomId",
          "routes/classrooms/classroom.tsx",
          { id: "classroom" },
          [
            index("routes/classrooms/classroom-overview.tsx"),
            route("roster", "routes/classrooms/classroom-roster.tsx"),
            route(
              "seating-chart",
              "routes/classrooms/classroom-seating-chart.tsx"
            ),
            route("cold-call", "routes/classrooms/cold-call.tsx"),
          ]
        ),
        route(":classroomId/edit", "routes/classrooms/edit-classroom.tsx"),
        route(":classroomId/delete", "routes/classrooms/delete-classroom.tsx"),
        route(
          ":classroomId/randomize-seating-chart",
          "routes/classrooms/randomize-seating-chart.tsx"
        ),
        route("separations/new", "routes/classrooms/create-separation.tsx"),
        route(
          "separations/:separationId/delete",
          "routes/classrooms/delete-separation.tsx"
        ),
      ]),
    ]),
  ]),
] satisfies RouteConfig
