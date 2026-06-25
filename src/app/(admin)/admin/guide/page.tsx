import { GuideContent } from "@/components/guide-content";

export const metadata = { title: "Advisor Guide — Fed Navigator" };

export default function AdminGuidePage() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <a
          href="/advisor-guide.pdf"
          download
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-line-1 bg-surface px-3.5 py-2 text-[13px] font-medium text-ink-2 hover:bg-bg-2 hover:text-ink-1"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
            <path d="M5 21h14" />
          </svg>
          Download PDF
        </a>
      </div>
      <GuideContent />
    </div>
  );
}
