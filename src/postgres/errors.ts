import { extendedPromise } from '../helpers/promiseExecutor'
import { ResultPromise, Result } from '../functional/result'
import { ObjectArrayPromise, ObjectArrayResultPromise } from '../helpers/promises'
import type { QueryResult } from 'pg'

export type DBError = Error & {
    name: string
    length: number
    severity: string
    code: string
    detail: string
    hint: string
    position: string
    internalPosition: string
    internalQuery: string
    where: string
    schema: string
    table: string
    column: string
    dataType: string
    constraint: string
    file: string
    line: string
    routine: string
    query: string
    queryData: unknown
}

// Represents a promise for the rows of the query
export class DBResultPromise<T extends {}> extends ObjectArrayPromise<T> {
    public static from<T extends {}>(promise: Promise<QueryResult<T>>): DBResultPromise<T> {
        return extendedPromise<T[], DBResultPromise<T>>(
            DBResultPromise,
            super.build(promise.then((result) => result.rows))
        )
    }

    public parseErrors<E>(errorMapping: ParseErrors<E>): ObjectArrayResultPromise<E, T> {
        const promise = this.then((rows) => Result.ok<T[], E>(rows)).catch((error: DBError) =>
            parseErrors<E, T[]>(errorMapping, error)
        )
        return ObjectArrayResultPromise.build(ResultPromise.from(promise))
    }
}

export type ParseErrors<E> = {
    [key: string]: E
}

function parseErrors<E, T>(errorMapping: ParseErrors<E>, error: DBError): Result<E, T> {
    let key

    if (error.routine === 'range_serialize') {
        // range_serialize is a range error message
        key = 'range'
    } else if (!error.code) {
        throw error
    } else if (error.code === '23502') {
        // not_null_violation
        key = `${error.table}_${error.column}_null`
    } else if (error.code === '2201X') {
        // invalid_row_count_in_result_offset_clause
        key = 'offset'
    } else if (!error.code.startsWith('23')) {
        // 23XXX are integrity violations which is what we're mostly looking for
        throw error
    } else {
        key = error.constraint
    }

    // If we have no message we are not planning for this error so throw
    const messageOrFunction = errorMapping[key]
    if (messageOrFunction === undefined) throw error
    return Result.err<E, T>(messageOrFunction)
}
