"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadClientLogo } from "../actions";
import type { Client } from "@/lib/supabase/types";

export function LogoUpload({ client }: { client: Client }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      {client.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={client.logo_url}
          alt={client.name}
          className="h-24 w-24 rounded border object-contain"
        />
      ) : (
        <div className="grid h-24 w-24 place-items-center rounded border text-xs text-muted-foreground">
          no logo
        </div>
      )}
      <form
        action={(fd) => {
          startTransition(async () => {
            try {
              await uploadClientLogo(client.id, fd);
              toast.success("Logo updated");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Upload failed");
            }
          });
        }}
        className="space-y-2"
      >
        <Input type="file" name="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" required />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Uploading..." : "Upload"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Stored in the <code>client-logos</code> Supabase bucket (create it via dashboard, public read).
        </p>
      </form>
    </div>
  );
}
