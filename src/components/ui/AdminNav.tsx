"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { COURSE_OPTIONS, normalizeCourseId } from "@/lib/courseConfig"

function withCourse(basePath: string, courseId: string) {
  const params = new URLSearchParams()
  params.set("course", courseId)
  return `${basePath}?${params.toString()}`
}

export default function AdminNav() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selectedCourseId = normalizeCourseId(searchParams.get("course"))

  return (
    <nav style={{ marginBottom: "20px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
      <Link href={withCourse("/", selectedCourseId)} className="btn ghost mini">← My Loom</Link>
      <Link href={withCourse("/admin", selectedCourseId)} className="btn mini">Learners</Link>
      <Link href={withCourse("/admin/aggregate", selectedCourseId)} className="btn mini">Cohort Map</Link>
      <Link href={withCourse("/admin/library", selectedCourseId)} className="btn mini">Readings</Link>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
        <span className="label">Course</span>
        <select
          className="tinput"
          value={selectedCourseId}
          aria-label="Select active course"
          style={{ minWidth: "240px" }}
          onChange={(event) => {
            const next = new URLSearchParams(searchParams.toString())
            next.set("course", normalizeCourseId(event.target.value))
            router.push(`${pathname}?${next.toString()}`)
          }}
        >
          {COURSE_OPTIONS.map((course) => (
            <option key={course.id} value={course.id}>{course.label}</option>
          ))}
        </select>
      </div>
    </nav>
  )
}
