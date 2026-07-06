import { getServerSession } from "next-auth/next"
import { authOptions, isAdminUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    redirect("/")
  }

  if (!isAdminUser(session.user)) {
    redirect("/")
  }

  return (
    <div style={{ padding: "20px" }}>
      <nav style={{ marginBottom: "20px", display: "flex", gap: "20px" }}>
        <Link href="/" className="btn ghost mini">← Back to my Loom</Link>
        <Link href="/admin" className="btn mini">Class View</Link>
        <Link href="/admin/aggregate" className="btn mini">Aggregate View</Link>
        <Link href="/admin/library" className="btn mini">Library Manager</Link>
      </nav>
      {children}
    </div>
  )
}
