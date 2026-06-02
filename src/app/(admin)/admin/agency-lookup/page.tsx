import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AgencyForm } from "./agency-form";
import type { AgencyLookup } from "@/lib/supabase/types";

export default async function AgencyLookupPage() {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("agency_lookup")
    .select("*")
    .order("domain");
  const list = (data ?? []) as AgencyLookup[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agency lookup</h1>
        <p className="text-sm text-muted-foreground">
          Map email domains to agency names. Used to fill the &quot;Agency&quot; column on attendees.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Add / update</CardTitle>
        </CardHeader>
        <CardContent>
          <AgencyForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>All entries ({list.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Agency name</TableHead>
                <TableHead>Short</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((a) => (
                <TableRow key={a.domain}>
                  <TableCell className="font-mono text-xs">{a.domain}</TableCell>
                  <TableCell>{a.agency_name}</TableCell>
                  <TableCell className="text-muted-foreground">{a.agency_short ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
