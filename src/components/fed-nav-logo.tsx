/**
 * Fed Navigator app-tile mark — navy rounded square with a white compass and
 * red needle. Self-contained (its own background), so it drops straight into a
 * logo chip. Size it with `className` (e.g. "h-8 w-8").
 */
export function FedNavLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Fed Navigator"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="100" height="100" rx="22" fill="#0E2A52" />
      <g transform="translate(20,20) scale(0.6)">
        <circle cx="50" cy="50" r="44" fill="none" stroke="#FFFFFF" strokeWidth="6" />
        <path d="M50 18 L57 50 L43 50 Z" fill="#C8102E" />
        <path d="M50 82 L57 50 L43 50 Z" fill="#FFFFFF" />
        <circle cx="50" cy="50" r="5" fill="#0E2A52" stroke="#FFFFFF" strokeWidth="2.5" />
      </g>
    </svg>
  );
}
