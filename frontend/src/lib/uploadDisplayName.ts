/** Label shown in UI — always prefer the name the user picked at upload time. */
export function originalUploadFileName(upload: { fileName?: string }, file: File): string {
    const fromApi = upload.fileName?.trim();
    if (fromApi)
        return fromApi;
    return file.name;
}

function looksLikeGeneratedStorageFileName(name: string): boolean {
    const base = name.split('/').pop() ?? name;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i.test(base);
}

export function formatUploadedFileLabel(
    storagePath: string | null | undefined,
    originalName: string | null | undefined,
    placeholder: string,
): string {
    const label = originalName?.trim();
    if (label)
        return label;
    if (!storagePath?.trim())
        return placeholder;
    const fromPath = storagePath.split('/').pop() ?? '';
    if (fromPath && !looksLikeGeneratedStorageFileName(fromPath))
        return fromPath;
    return placeholder;
}
