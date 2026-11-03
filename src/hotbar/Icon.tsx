export type IconName =
  | "pen"
  | "arrow"
  | "rectangle"
  | "ellipse"
  | "eyedropper"
  | "note"
  | "eraser"
  | "trash"
  | "close";

export function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    pen: (
      <>
        <path d="m15 4 5 5M4 20l4.5-1L20 7.5a2.1 2.1 0 0 0-3-3L5.5 16Z" />
        <path d="m5.5 16 3.5 3" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 19 19 5M8 5h11v11" />
      </>
    ),
    rectangle: <rect x="4" y="5" width="16" height="14" rx="1" />,
    ellipse: <ellipse cx="12" cy="12" rx="8" ry="7" />,
    eyedropper: (
      <>
        <path d="m14 5 5 5M15 4a2.1 2.1 0 0 1 3 0l2 2a2.1 2.1 0 0 1 0 3l-3 3-5-5Z" />
        <path d="m13 8-9 9v3h3l9-9" />
      </>
    ),
    note: (
      <>
        <path d="M14 3H5v18h14V8Z" />
        <path d="M14 3v5h5M8 12h8M8 16h5" />
      </>
    ),
    eraser: (
      <>
        <path d="m14 3 7 7-11 11H5l-4-4Z" />
        <path d="m7 11 7 7M10 21h11" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
      </>
    ),
    close: <path d="m7 7 10 10M17 7 7 17" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
