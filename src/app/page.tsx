import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const session = await getCurrentUser();
  if (!session) redirect("/login");
  const role = session.appUser?.role;
  if (!role) redirect("/login?error=no-role");

  // Advisor lands on their single assigned client page directly.
  if (role === "advisor" || role === "client") {
    const cid = session.appUser?.client_id;
    if (!cid) redirect("/login?error=no-client");
    redirect(`/admin/clients/${cid}`);
  }

  // admin / editor / super_advisor → clients list (filtered for super_advisor)
  redirect("/admin/clients");
}
