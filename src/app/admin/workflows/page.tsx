import { getStaffViewer } from "@/actions/admin"
import WorkflowsBoard from "@/components/admin/WorkflowsBoard"

/**
 * Workflows — how each kind of person moves through Loom.
 *
 * Gated with `getStaffViewer` rather than `checkAdmin`: the page holds no
 * course data at all (no roster, no graph, nothing per-student), and faculty
 * teaching the course have the most use for the student flow. The layout
 * already admits admins and faculty; this turns away anyone else, per the
 * house rule that a page under /admin gates itself rather than trusting the
 * shell.
 */
export default async function AdminWorkflowsPage() {
  await getStaffViewer()

  return (
    <main>
      <h1>Workflows</h1>
      <p style={{ marginBottom: "20px" }}>
        What each person does, in order, and where each step happens. Kept beside the
        code rather than in a drawing tool, so it can be corrected in the same commit
        that changes the thing.
      </p>
      <WorkflowsBoard />
    </main>
  )
}
