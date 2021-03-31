export type ArrayOrValue<T> = T | Array<T>
export function isArray<T>(arrayOrNotArray: ArrayOrValue<T>): arrayOrNotArray is T[] {
    return Array.isArray(arrayOrNotArray)
}

export type Nullable<T> = T | null

export type Replace<Source, By extends {}> = Omit<Source, keyof By> & By
