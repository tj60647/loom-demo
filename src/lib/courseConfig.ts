export type CourseOption = {
  id: string
  label: string
}

export const COURSE_OPTIONS: CourseOption[] = [
  { id: "course-foundations-studio", label: "Foundations Studio" },
  { id: "course-systems-lab", label: "Systems Lab" },
  { id: "course-ai-society-seminar", label: "AI + Society Seminar" },
]

export const DEFAULT_COURSE_ID = COURSE_OPTIONS[0].id

export function normalizeCourseId(input?: string | null) {
  if (!input) return DEFAULT_COURSE_ID
  const match = COURSE_OPTIONS.find((course) => course.id === input)
  return match?.id ?? DEFAULT_COURSE_ID
}

export function getCourseLabel(courseId: string) {
  return COURSE_OPTIONS.find((course) => course.id === courseId)?.label ?? "Unnamed Course"
}
