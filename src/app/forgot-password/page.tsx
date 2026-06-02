import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = { title: "Reset password — Fed Navigator" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-7">
        <div className="space-y-3 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-[10px] border border-[oklch(0.10_0.01_260)] bg-gradient-to-br from-[oklch(0.22_0.02_260)] to-[oklch(0.14_0.015_260)] font-display text-[15px] font-bold tracking-[0.04em] text-lime shadow-[0_1px_0_oklch(1_0_0_/_0.6)_inset,0_4px_14px_oklch(0.20_0.02_260/0.18)]">
            FP
          </div>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.025em] text-ink-1 dark:text-white">
            Reset password
          </h1>
          <p className="text-[13px] text-ink-3">
            Enter your email and we&apos;ll send a reset link.
          </p>
        </div>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
