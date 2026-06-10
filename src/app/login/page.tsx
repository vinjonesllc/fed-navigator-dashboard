import { LoginForm } from "./login-form";
import { FedNavLogo } from "@/components/fed-nav-logo";

export const metadata = { title: "Sign in — Fed Navigator" };

type SearchParams = Promise<{ next?: string; error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-7">
        <div className="space-y-3 text-center">
          <FedNavLogo className="mx-auto h-12 w-12 shadow-[0_4px_14px_oklch(0.20_0.02_260/0.18)]" />
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.025em] text-ink-1">
            Fed Navigator
          </h1>
        </div>
        <LoginForm next={params.next} error={params.error} />
      </div>
    </div>
  );
}
