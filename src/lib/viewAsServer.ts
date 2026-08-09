import { cookies } from "next/headers"
import { VIEW_AS_STUDENT_COOKIE } from "@/lib/viewAs"

/**
 * Is the viewer currently wearing the student lens? Server only — see
 * src/lib/viewAs.ts for what the lens is and, importantly, what it is not:
 * it withholds and never grants, and no authorization path consults it.
 */
export async function viewingAsStudent(): Promise<boolean> {
  const jar = await cookies()
  return jar.get(VIEW_AS_STUDENT_COOKIE)?.value === "1"
}
