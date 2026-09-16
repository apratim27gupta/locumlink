type FacebookIconProps = {
    size?: number;
    className?: string;
};

export default function FacebookIcon({ size = 20, className }: FacebookIconProps) {
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
                d="M22.68 0H1.32A1.32 1.32 0 0 0 0 1.32v21.36C0 23.41.59 24 1.32 24h11.5v-9.29H9.69V11.1h3.13V8.41c0-3.1 1.89-4.79 4.66-4.79 1.33 0 2.47.1 2.8.14v3.25h-1.92c-1.5 0-1.8.72-1.8 1.76v2.31h3.6l-.47 3.61h-3.13V24h6.12A1.32 1.32 0 0 0 24 22.68V1.32A1.32 1.32 0 0 0 22.68 0z"
            />
        </svg>
    );
}
