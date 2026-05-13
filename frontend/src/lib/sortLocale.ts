/** Case-insensitive alphabetical sort for dropdown labels and string options. */
export function sortStringsLocale(strings: readonly string[]): string[] {
    return [...strings].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function sortByLabel<T extends { label: string }>(items: readonly T[]): T[] {
    return [...items].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}
