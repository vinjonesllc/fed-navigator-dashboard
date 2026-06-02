import { Suspense } from "react";
import { CallbackHandler } from "./callback-handler";

export const dynamic = "force-dynamic";
export const metadata = { title: "Signing in…" };

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-12 text-sm text-muted-foreground">
          Signing you in…
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
