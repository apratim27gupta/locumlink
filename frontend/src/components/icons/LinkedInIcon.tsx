type LinkedInIconProps = {
  size?: number;
  className?: string;
};

/** LinkedIn app icon: brand blue rounded square with white "in". */
export default function LinkedInIcon({ size = 32, className }: LinkedInIconProps) {
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
      <rect width="40" height="40" rx="10" fill="#0A66C2" />
      <path
        fill="#fff"
        d="M12.1 16.35H8.55V31.1h3.55V16.35zM10.32 9.5a2.06 2.06 0 1 0 0 4.12 2.06 2.06 0 0 0 0-4.12zM31.45 31.1h-3.55v-7.3c0-1.74-.03-3.97-2.42-3.97-2.42 0-2.79 1.89-2.79 3.84V31.1h-3.55V16.35h3.41v2.01h.05c.48-1.14 1.87-2.34 3.85-2.34 4.12 0 4.88 2.71 4.88 6.23V31.1z"
      />
    </svg>
  );
}
