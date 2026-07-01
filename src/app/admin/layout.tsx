import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    redirect("/")
  }

  const isAdmin = session.user.role === "ADMIN" || session.user.email === "tjm@tjmcleish.com" || session.user.email === "tjmcleish@berkeley.edu";
  if (!isAdmin) {
    redirect("/")
  }

  return (
    <div style={{ padding: "20px" }}>
      <nav style={{ marginBottom: "20px", display: "flex", gap: "20px" }}>
        <a href="/" className="btn ghost mini">← Back to my Loom</a>
        <a href="/admin" className="btn mini">Class View</a>
        <a href="/admin/aggregate" className="btn mini">Aggregate View</a>
      </nav>
      {children}
    </div>
  )
}
