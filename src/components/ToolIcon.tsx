export function ToolIcon({ kind }: { kind: string }) {
  const path =
    kind === "select" ? (
      <>
        <path d="M10 1v5m0 8v5M1 10h5m8 0h5" />
        <circle cx="10" cy="10" r="1" />
      </>
    ) : kind === "horizontal" ? (
      <>
        <path d="M2 10h16" />
        <circle cx="5" cy="10" r="2" />
      </>
    ) : kind === "trend" ? (
      <>
        <path d="m5 15 10-10" />
        <circle cx="4" cy="16" r="2" />
        <circle cx="16" cy="4" r="2" />
      </>
    ) : kind === "ray" ? (
      <>
        <path d="M4 15 18 3" />
        <circle cx="4" cy="15" r="2" />
        <path d="m14 3h4v4" />
      </>
    ) : kind === "zone" ? (
      <>
        <rect x="3" y="4" width="14" height="12" />
        <path d="M1 2h4v4H1zm14 12h4v4h-4z" />
      </>
    ) : kind === "fib" ? (
      <>
        <path d="M3 3h14M3 7h10M3 11h14M3 16h9" />
        <circle cx="3" cy="3" r="1" />
        <circle cx="12" cy="16" r="1" />
      </>
    ) : kind === "magnet" ? (
      <>
        <path d="M4 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3zM4 7h4m4 0h4" />
      </>
    ) : (
      <>
        <rect x="3" y="2" width="14" height="16" />
        <path d="M3 10h14" />
        <path
          d={kind === "long" ? "m7 7 3-3 3 3m-3-3v12" : "m7 13 3 3 3-3m-3 3V4"}
        />
      </>
    );
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}
