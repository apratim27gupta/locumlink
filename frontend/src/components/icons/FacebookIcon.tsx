type FacebookIconProps = {
  size?: number;
  className?: string;
};

/**
 * Facebook app icon: brand blue rounded square with white "f".
 * The f sits left-of-center (Meta brand placement), not on the right.
 */
export default function FacebookIcon({ size = 32, className }: FacebookIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect width="40" height="40" rx="10" fill="#1877F2" />
      <path
        fill="#fff"
        d="M23.2 21.15h4.25l.65-4H23.2v-2.45c0-1.15.32-1.95 1.98-1.95H27.5V9.1c-.38-.05-1.7-.17-3.22-.17-3.18 0-5.36 1.94-5.36 5.5v2.72H15.7v4h3.22V32.5h4.28V21.15z"
      />
    </svg>
  );
}
