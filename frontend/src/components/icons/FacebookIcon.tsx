type FacebookIconProps = {
  size?: number;
  className?: string;
};

/** White "f" mark for use on a Facebook-blue rounded button. */
export default function FacebookIcon({ size = 22, className }: FacebookIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <path
        fill="currentColor"
        d="M14.5 8.25V6.6c0-.7.15-1.1 1.2-1.1h1.55V3.05S15.9 2.75 14.35 2.75c-3.05 0-5.1 1.86-5.1 5.28v2.22H6.75V13h2.5v8.25h3.25V13h2.7l.4-2.75h-3.1z"
      />
    </svg>
  );
}
