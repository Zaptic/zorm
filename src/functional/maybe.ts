import { ResultPromise, Result } from './result'
import { extendedPromise, PromiseExecutor } from '../helpers/promiseExecutor'

/**
 * Represent the result of an operation that may or may not return a
 * value
 */
export namespace Maybe {
    export function just<T>(value: T): Maybe<T> {
        return new Just(value)
    }

    export function nothing<T = unknown>(): Maybe<T> {
        return new Nothing()
    }

    /**
     * Returns a `Just` with the value given if it is not `null` or `undefined`.
     * Returns `Nothing` otherwise
     */
    export function fromOptional<T = unknown>(value: T | undefined | null): Maybe<T> {
        return value === undefined || value === null ? Maybe.nothing() : Maybe.just(value)
    }

    /**
     * This is here because the `Maybe` type does not have a constructor that
     * can be used with `instanceof`
     */
    export function isMaybe<T>(value: Maybe<T> | unknown): value is Maybe<T> {
        return value instanceof Just || value instanceof Nothing
    }

    export const orThrow = <T>(maybe: Maybe<T> | MaybePromise<T>) => maybe.orThrow()
}

export type Maybe<T> = Just<T> | Nothing<T>

export class MaybePromise<T> extends Promise<Maybe<T>> {
    /**
     * Create an `AsyncMaybe` from a `Promise` containing a `Maybe`
     */
    public static from<T>(promise: Promise<Maybe<T>>): MaybePromise<T> {
        return extendedPromise(MaybePromise as { new (executor: PromiseExecutor<Maybe<T>>): MaybePromise<T> }, promise)
    }

    constructor(executor: PromiseExecutor<Maybe<T>>) {
        super(executor)
    }

    /**
     * Because this function is asynchronous, it cannot narrow the type of the
     * `AsyncMaybe`. Consider using `.then` or `await`-ing instead
     */
    public isJust() {
        return this.then((maybe) => maybe.isJust())
    }

    /**
     * Because this function is asynchronous, it cannot narrow the type of the
     * `AsyncMaybe`. Consider using `.then` or `await`-ing instead
     */
    public isNothing() {
        return this.then((maybe) => maybe.isNothing())
    }

    /**
     * Transforms the value inside a `Just`, or returns the `Nothing` if called
     * on `Nothing`.
     *
     * The function provided can also return a `Promise`, and that promise will
     * be resolved as required
     */
    public map<U>(fn: (input: T) => U | Promise<U>): MaybePromise<U> {
        return this.promiseChain(async (maybe) =>
            maybe.isJust() ? Maybe.just(await fn(maybe.value)) : Maybe.nothing()
        )
    }

    /**
     * Calls the predicate with the value in the `Just`. Returns the `Just` if
     * the predicate is true, or a `Nothing` otherwise. If `filter` is called on
     * a `Nothing` it will return `Nothing`.
     *
     * The function provided can also return a `Promise`, and that promise will
     * be resolved as required
     */
    public filter(predicate: (input: T) => boolean | Promise<boolean>): MaybePromise<T> {
        return this.promiseChain(async (maybe) =>
            maybe.isNothing()
                ? Maybe.nothing()
                : (await predicate(maybe.value))
                ? Maybe.just(maybe.value)
                : Maybe.nothing()
        )
    }

    /**
     * The monadic `bind`.
     *
     * Allows the chaining functions that return `Maybe`s.
     * Returns the result of the function, or `Nothing` if called on `Nothing`
     *
     * The function provided can also return a `Promise`, and that promise will
     * be resolved as required
     */
    public chain<U>(fn: (input: T) => Maybe<U> | Promise<Maybe<U>> | MaybePromise<U>): MaybePromise<U> {
        return this.promiseChain(async (maybe) => (maybe.isJust() ? fn(maybe.value) : Maybe.nothing()))
    }

    /**
     * Either resolve to the value of the `Just` or reject the promise if called
     * on `Nothing`. Consider using `toResult` instead
     */
    public orThrow(error?: Error | string): Promise<T | never> {
        return this.then((maybe) => maybe.orThrow(error))
    }

    /**
     * Either resolve to the value of the `Just`, or the value given.
     *
     * The value provided can also be a `Promise`, and that promise will
     * be resolved as required
     */
    public async withDefault(value: T | Promise<T>): Promise<T> {
        const defaultValue = await value
        return this.then((maybe) => maybe.withDefault(defaultValue))
    }

    /**
     * Either resolve to the value of the `Just`, or the value returned by the
     * function given.
     */
    public orElseDo(fn: () => T | Promise<T>): Promise<T> {
        return this.then((maybe) => (maybe.isJust() ? maybe.value : fn()))
    }

    /**
     * Returns an `Ok` with the value inside the `Just` or an `Err` if called
     * on a `Nothing`. This returns an `AsyncResult`
     */
    public toResult<E>(error: E): ResultPromise<E, T> {
        return ResultPromise.from(this.then((result) => result.toResult(error)))
    }

    private promiseChain<U>(fn: (maybe: Maybe<T>) => Promise<Maybe<U>>): MaybePromise<U> {
        return new MaybePromise<U>((resolve, reject) => {
            this.then((maybe) => resolve(fn(maybe)), reject)
        })
    }
}

export class Just<T> {
    constructor(public readonly value: T) {}

    public isJust(): this is Just<T> {
        return true
    }

    public isNothing(): this is Nothing<T> {
        return false
    }

    /** Transforms the value inside a `Just`, or returns the `Nothing` if called on an `Nothing` */
    public map<U>(fn: (value: T) => U): Maybe<U> {
        return Maybe.just(fn(this.value))
    }

    /**
     * Calls the predicate with the value in the `Just`. Returns the `Just` if the predicate is true,
     * or a `Nothing` otherwise. If `filter` is called on a `Nothing` it will return `Nothing`
     */
    public filter(predicate: (value: T) => boolean): Maybe<T> {
        return predicate(this.value) ? Maybe.just(this.value) : Maybe.nothing()
    }

    /**
     * The monadic `bind`.
     *
     * Allows the chaining functions that return `Maybe`s.
     * Returns the result of the function, or `Nothing` if called on `Nothing`
     */
    public chain<U>(fn: (value: T) => Maybe<U>): Maybe<U> {
        return fn(this.value)
    }

    /**
     * Either return the value of the `Just` or throw an error if called on `Nothing`
     * This is here mainly for testing. Consider using:
     *
     * - an if statement with `.isJust` or `.isNothing`, or;
     * - `toResult`
     *
     * in other situations
     */
    public orThrow(_?: Error | string): T {
        return this.value
    }

    /** Either return the value of the `Just`, or the value given */
    public withDefault(_: T): T {
        return this.value
    }

    /**
     * Either return to the value of the `Just`, or the value returned by the
     * function given. Also consider using an if-statement with `isJust` or
     * `isNothing`.
     */
    public orElseDo(_: () => T): T {
        return this.value
    }

    /**
     * Returns an `Ok` with the value inside the `Just` or an `Err` if called
     * on a `Nothing`
     */
    public toResult<E>(_: E): Result<E, T> {
        return Result.ok(this.value)
    }
}

export class Nothing<T = unknown> {
    public isJust(): this is Just<T> {
        return false
    }

    public isNothing(): this is Nothing<T> {
        return true
    }

    /** Transforms the value inside a `Just`, or returns the `Nothing` if called on an `Nothing` */
    public map<U>(_: (value: T) => U): Maybe<U> {
        return Maybe.nothing()
    }

    /**
     * Calls the predicate with the value in the `Just`. Returns the `Just` if the predicate is true,
     * or a `Nothing` otherwise. If `filter` is called on a `Nothing` it will return `Nothing`
     */
    public filter(_: (value: T) => boolean): Maybe<T> {
        return Maybe.nothing()
    }

    /**
     * The monadic `bind`.
     *
     * Allows the chaining functions that return `Maybe`s.
     * Returns the result of the function, or `Nothing` if called on `Nothing`
     */
    public chain<U>(_: (value: T) => Maybe<U>): Maybe<U> {
        return Maybe.nothing()
    }

    /**
     * Either return the value of the `Just` or throw an error if called on `Nothing`
     * This is here mainly for testing. Consider using:
     *
     * - an if statement with `.isJust` or `.isNothing`, or;
     * - `toResult`
     *
     * in other situations
     */
    public orThrow(error: Error | string = 'Attempted to extract a value from a Nothing'): never {
        throw typeof error === 'string' ? new Error(error) : error
    }

    /** Either return the value of the `Just`, or the value given */
    public withDefault(value: T): T {
        return value
    }

    /**
     * Either return to the value of the `Just`, or the value returned by the
     * function given. Also consider using an if-statement with `isJust` or
     * `isNothing`.
     */
    public orElseDo(fn: () => T): T {
        return fn()
    }

    /**
     * Returns an `Ok` with the value inside the `Just` or an `Err` if called
     * on a `Nothing`
     */
    public toResult<E>(error: E): Result<E, T> {
        return Result.err(error)
    }
}
