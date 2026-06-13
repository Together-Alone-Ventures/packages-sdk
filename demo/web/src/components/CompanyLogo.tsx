type Props = { className?: string; title?: string };

/** Neutral monogram for the demo tenant. */
export function CompanyLogo({ className = 'h-8 w-8', title = 'Meridian Cloud' }: Props) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="company-logo-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#company-logo-bg)" />
      <path
        d="M18 46 V22 L32 38 L46 22 V46 H38 V34 H26 V46 Z"
        fill="#fafafa"
      />
    </svg>
  );
}
