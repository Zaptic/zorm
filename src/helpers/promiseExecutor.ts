/**
 * This type is used to describe the function passed a parameter to new Promise().
 * The original type cannot be accessed easily because it is declared inline as a constructor type.
 */
export type PromiseExecutor<T> = (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void

export function extendedPromise<T, P extends Promise<T>>(
    ExtendedPromise: new (executor: PromiseExecutor<T>) => P,
    promise: Promise<T>
): P {
    return new ExtendedPromise((resolve, reject) => {
        promise.then(resolve, reject)
    })
}
