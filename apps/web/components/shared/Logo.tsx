export function Logo({ mark = true }: { mark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-foam">
      {mark && (
        <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M6 22c6-12 14-12 20 0" fill="none" stroke="#8d7bff" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M9 18c4.2-7 9.8-7 14 0" fill="none" stroke="#3ec6ff" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="16" cy="23.5" r="2.2" fill="#f4f1ea" />
        </svg>
      )}
      <span className="font-display text-lg font-semibold tracking-tight">MotionPlay</span>
    </span>
  );
}
