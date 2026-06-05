import { LoginForm } from "./login-form";

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
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-[10px] border border-[oklch(0.10_0.01_260)] bg-gradient-to-br from-[oklch(0.22_0.02_260)] to-[oklch(0.14_0.015_260)] text-lime shadow-[0_1px_0_oklch(1_0_0_/_0.6)_inset,0_4px_14px_oklch(0.20_0.02_260/0.18)]">
            <svg
              viewBox="0 0 24 24"
              className="h-7 w-7 drop-shadow-[0_0_6px_oklch(0.86_0.21_130/0.55)]"
              fill="currentColor"
              aria-hidden="true"
            >
              {/* 4-point navigation star */}
              <path d="M12 1.5c.55 5.4 2.1 6.95 9 10.5-6.9 3.55-8.45 5.1-9 10.5-.55-5.4-2.1-6.95-9-10.5 6.9-3.55 8.45-5.1 9-10.5Z" />
            </svg>
          </div>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.025em] text-ink-1">
            Fed Navigator
          </h1>
        </div>
        <LoginForm next={params.next} error={params.error} />
      </div>
    </div>
  );
}
