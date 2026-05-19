/** Label shown in UI — always prefer the name the user picked at upload time. */
export function originalUploadFileName(upload: { fileName?: string }, file: File): string {
    const fromApi = upload.fileName?.trim();
    if (fromApi)
        return fromApi;
    return file.name;
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
    return storagePath.split('/').pop() ?? placeholder;
}
