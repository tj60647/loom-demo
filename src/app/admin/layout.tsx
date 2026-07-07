import { getServerSession } from "next-auth/next"
import { authOptions, isAdminUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import AdminNav from "@/components/ui/AdminNav"

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
      <AdminNav />
      {children}
    </div>
  )
}
