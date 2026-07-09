type AppleIconProps = {
    size?: number;
    className?: string;
};

export default function AppleIcon({ size = 24, className }: AppleIconProps) {
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
                d="M16.74 12.27c.02 2.23 1.95 2.97 1.97 2.98-.02.05-.31 1.08-1.03 2.14-.62.9-1.26 1.79-2.28 1.81-1 .02-1.32-.59-2.47-.59-1.15 0-1.51.57-2.45.61-1 .04-1.75-.98-2.37-1.88C6.84 15.37 5.9 11.86 7.29 9.45c.69-1.19 1.92-1.95 3.26-1.97.96-.02 1.87.65 2.47.65.6 0 1.72-.8 2.89-.68.49.02 1.88.2 2.78 1.53-.07.04-1.66.97-1.65 2.89Zm-1.8-5.45c.52-.63.87-1.51.77-2.38-.75.03-1.65.5-2.19 1.12-.48.55-.9 1.44-.78 2.28.84.07 1.69-.42 2.2-1.02Z"
                fill="currentColor"
            />
        </svg>
    );
}
