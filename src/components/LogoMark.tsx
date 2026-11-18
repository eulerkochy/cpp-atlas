/** The mark: an ink disc with a small sun rising at its edge. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={24}
      height={24}
      className={className}
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="16" fill="var(--logo-ground)" />
      <circle cx="22.5" cy="10" r="5.5" fill="#FFC93A" />
      <path
        d="M7 22.5h18"
        stroke="#FBFAF6"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
