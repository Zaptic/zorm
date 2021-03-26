export function isArray<T>(arrayOrNotArray: T | T[]): arrayOrNotArray is T[] {
    return Array.isArray(arrayOrNotArray)
}

export type Nullable<T> = T | null

export type Replace<Source, By extends {}> = Omit<Source, keyof By> & By
