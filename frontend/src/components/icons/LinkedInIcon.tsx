type LinkedInIconProps = {
  size?: number;
  className?: string;
};

/** White "in" mark for use on a LinkedIn-blue rounded button. */
export default function LinkedInIcon({ size = 22, className }: LinkedInIconProps) {
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
        d="M6.54 8.5H3.56V20.5h2.98V8.5zM5.05 3.5a1.73 1.73 0 1 0 0 3.46 1.73 1.73 0 0 0 0-3.46zM20.5 12.86c0-3.52-1.88-5.16-4.39-5.16-2.02 0-2.92 1.11-3.43 1.89V8.5H9.72c.04.86 0 12 0 12h2.96v-6.7c0-.36.03-.72.13-1 .29-.72.94-1.47 2.04-1.47 1.44 0 2.01 1.1 2.01 2.7V20.5h2.96v-7.64z"
      />
    </svg>
  );
}
