import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClientWorkshops } from "@/lib/queries";
import { formatWorkshopDate } from "@/lib/format-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function WorkshopsListPage() {
  const session = await requireUser();
  const clientId = session.appUser?.client_id;
  if (!clientId) redirect("/login?error=no-client");

  const workshops = await getClientWorkshops(clientId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workshops</h1>
        <p className="text-sm text-muted-foreground">Click a row for the detail view.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All workshops ({workshops.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Presenter</TableHead>
                <TableHead className="text-right">Registered</TableHead>
                <TableHead className="text-right">Attended</TableHead>
                <TableHead className="text-right">Avg engagement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workshops.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No workshops yet.
                  </TableCell>
                </TableRow>
              )}
              {workshops.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>{formatWorkshopDate(w.workshop_date)}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/dashboard/workshops/${w.id}`} className="hover:underline">
                      {w.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{w.presenter ?? "—"}</TableCell>
                  <TableCell className="text-right">{w.registered_count}</TableCell>
                  <TableCell className="text-right">{w.attended_count}</TableCell>
                  <TableCell className="text-right">
                    {w.avg_engagement?.toFixed(1) ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
