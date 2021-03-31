import { PromiseExecutor, extendedPromise } from '../helpers/promiseExecutor'

export type ResultPattern<E, O, T> = {
    ok: (value: O) => T
    err: (value: E) => T
}

/** Represent operations that may fail */
export namespace Result {
    export function ok<O, E = unknown>(value: O): Result<E, O> {
        return new Ok(value)
    }

    export function err<E, O = unknown>(value: E): Result<E, O> {
        return new Err(value)
    }

    /** An 'async' version of `ok`; returns an AsyncResult containing the given value */
    export function asyncOk<O, E = unknown>(value: O | Promise<O>): ResultPromise<E, O> {
        if (value instanceof Promise) return ResultPromise.from(value.then((v) => Result.ok<O, E>(v)))
        return ResultPromise.from(Promise.resolve(Result.ok<O, E>(value)))
    }

    /** An 'async' version of `err`; returns an AsyncResult containing the given value */
    export function asyncErr<E, O = unknown>(value: E | Promise<E>): ResultPromise<E, O> {
        if (value instanceof Promise) return ResultPromise.from(value.then((v) => Result.err<E, O>(v)))
        return ResultPromise.from(Promise.resolve(Result.err<E, O>(value)))
    }
}

export type Result<E, O> = Err<E, O> | Ok<O, E>

export class ResultPromise<E, O> extends Promise<Result<E, O>> {
    /**
     * Create an `AsyncResult` from a `Promise` containing a `Result`
     */
    public static from<E, O>(promise: Promise<Result<E, O>>): ResultPromise<E, O> {
        return extendedPromise(
            ResultPromise as { new (executor: PromiseExecutor<Result<E, O>>): ResultPromise<E, O> },
            promise
        )
    }

    constructor(executor: PromiseExecutor<Result<E, O>>) {
        super(executor)
    }

    /**
     * Transforms the value inside an `Ok`, or returns the `Err` if called
     * on an `Err`.
     *
     * The function provided can also return a `Promise`, and that promise will
     * be resolved as required
     */
    public map<P>(fn: (value: O) => P | Promise<P>): ResultPromise<E, P> {
        return this.promiseChain(async (result) =>
            result.isOk() ? Result.ok(await fn(result.value)) : Result.err(result.error)
        )
    }

    /**
     * Transforms the value inside an `Err`, or returns the `Ok` if called
     * on an `Ok`.
     *
     * The function provided can also return a `Promise`, and that promise will
     * be resolved as required
     */
    public mapErr<F>(fn: (value: E) => F | Promise<F>): ResultPromise<F, O> {
        return this.promiseChain(async (result) =>
            result.isErr() ? Result.err(await fn(result.error)) : Result.ok(result.value)
        )
    }

    /**
     * Calls the predicate with the value in the `Ok`. Returns the `Ok` if the
     * predicate is true, or an `Err` with the value in `onErr` otherwise. If
     * `filter` is called on an `Err` it will return that `Err`
     *
     * The return value of the function, and the value provided, can also be
     * `Promise`s, and thesepromise will be resolved as required
     */
    public filter(predicate: (value: O) => boolean | Promise<boolean>, onErr: E | Promise<E>): ResultPromise<E, O> {
        return this.promiseChain(async (result: Result<E, O>) =>
            result.isErr()
                ? Result.err(result.error)
                : result.isOk() && (await predicate(result.value))
                ? Result.ok(result.value)
                : Result.err(await onErr)
        )
    }

    /**
     * The monadic `bind`.
     *
     * Allows the chaining functions that return `Result`s.
     * Returns the result of the function, or the `Err` if called on an `Err`
     *
     * The function provided can also return a `Promise`, and that promise will
     * be resolved as required
     */
    public chain<P>(fn: (value: O) => Result<E, P> | Promise<Result<E, P>>): ResultPromise<E, P> {
        return this.promiseChain(async (result) => (result.isOk() ? fn(result.value) : Result.err(result.error)))
    }

    /**
     * Either resolve to the value of the `Ok` or reject the promise if called
     * on an `Err`.
     */
    public orThrow(error?: Error | string): Promise<O | never> {
        return this.then((result) => result.orThrow(error))
    }

    /**
     * Either resolve to the value of the `Ok`, or the value given
     *
     * The value provided can also be a `Promise`, and that promise will
     * be resolved as required
     */
    public async withDefault(value: O | Promise<O>): Promise<O> {
        const defaultValue = await value
        return this.then((result) => result.withDefault(defaultValue))
    }

    private promiseChain<L, K>(fn: (result: Result<E, O>) => Promise<Result<L, K>>): ResultPromise<L, K> {
        return new ResultPromise<L, K>((resolve, reject) => {
            this.then((result) => resolve(fn(result)), reject)
        })
    }
}

class Ok<O, E = unknown> {
    constructor(public readonly value: O) {}

    public isOk(): this is Ok<O, E> {
        return true
    }

    public isErr(): this is Err<E, O> {
        return false
    }

    /** Transforms the value inside an `Ok`, or returns the `Err` if called on an `Err` */
    public map<P>(fn: (value: O) => P): Result<E, P> {
        return Result.ok(fn(this.value))
    }

    /** Transforms the value inside an `Err`, or returns the `Ok` if called on an `Ok` */
    public mapErr<F>(_: (value: E) => F): Result<F, O> {
        return Result.ok(this.value)
    }

    /**
     * Calls the predicate with the value in the `Ok`. Returns the `Ok` if the
     * predicate is true, or an `Err` with the value in `onErr` otherwise. If
     * `filter` is called on an `Err` it will return that `Err`
     */
    public filter(predicate: (value: O) => boolean, onErr: E): Result<E, O> {
        return predicate(this.value) ? Result.ok(this.value) : Result.err(onErr)
    }

    /**
     * The monadic `bind`.
     *
     * Allows the chaining functions that return `Result`s.
     * Returns the result of the function, or the `Err` if called on an `Err`
     */
    public chain<P>(fn: (value: O) => Result<E, P>): Result<E, P> {
        return fn(this.value)
    }

    public orThrow(_?: Error | string): O {
        return this.value
    }

    /** Either return the value of the `Ok`, or the value given */
    public withDefault(_: O): O {
        return this.value
    }

    public toString(): string {
        return `Ok(${JSON.stringify(this.value, null, 2)})`
    }
}

class Err<E, O = unknown> {
    constructor(public readonly error: E) {}

    public isOk(): this is Ok<O, E> {
        return false
    }

    public isErr(): this is Err<E, O> {
        return true
    }

    /** Transforms the value inside an `Ok`, or returns the `Err` if called on an `Err` */
    public map<P>(_: (value: O) => P): Result<E, P> {
        return Result.err(this.error)
    }

    /** Transforms the value inside an `Err`, or returns the `Ok` if called on an `ok` */
    public mapErr<F>(fn: (value: E) => F): Result<F, O> {
        return Result.err(fn(this.error))
    }

    /**
     * Calls the predicate with the value in the `Ok`. Returns the `Ok` if the predicate is true,
     * or an `Err` with the value in `isErr` otherwise. If `filter` is called on an `Err` it will
     * return that `Err`
     */
    public filter(_: (value: O) => boolean, __: E): Result<E, O> {
        return Result.err(this.error)
    }

    /**
     * The monadic `bind`.
     *
     * Allows the chaining functions that return `Result`s.
     * Returns the result of the function, or the `Err` if called on an `Err`
     */
    public chain<P>(_: (value: O) => Result<E, P>): Result<E, P> {
        return Result.err(this.error)
    }

    /**
     * Either return the value of the `Ok` or throw an error if called on an `Err`
     * This is here mainly for testing. Consider using an if statement with `.isOk`
     * or `.isErr` in other situations
     */
    public orThrow(error: Error | string = 'Attempted to extract a value out of an Err'): never {
        throw typeof error === 'string' ? new Error(error) : error
    }

    /** Either return the value of the `Ok`, or the value given */
    public withDefault(value: O): O {
        return value
    }

    public toString(): string {
        return `Err(${JSON.stringify(this.error, null, 2)})`
    }
}
