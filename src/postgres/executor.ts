import * as fs from 'fs'
import type { PoolClient } from 'pg'
import { TypedQuery } from './typedQuery'
import { DBError, DBResultPromise } from './errors'

export class Executor {
    public client: PoolClient
    public closed = false
    private closedError = 'This Executor has been released'

    constructor(client: PoolClient) {
        this.client = client
    }

    public rollback() {
        return this.executeString('ROLLBACK')
    }

    public commit() {
        return this.executeString('COMMIT')
    }

    public begin() {
        return this.executeString('BEGIN')
    }

    /**
     * Opens a transaction, catch errors safely and rollback afterwards
     */
    public async transaction<T>(fn: (database: Executor) => Promise<T>) {
        // Run code safely in a try catch
        try {
            await this.begin()
            const result = await fn(this)
            await this.commit()

            return result
        } catch (err) {
            await this.rollback()

            throw err
        }
    }

    /**
     * Executes a query defined by a NamedQuery
     */
    public execute<Input extends {}, Output extends {}>(
        query: TypedQuery<Input, Output>,
        data?: Input
    ): DBResultPromise<Output> {
        if (!data) return this.executeString(query.parametrisedQuery)
        return this.executeString(query.parametrisedQuery, query.getParameterArray(data))
    }

    public executeString<T = never, R = never>(query: string, data?: T[]): DBResultPromise<R> {
        if (this.closed) throw new Error(this.closedError)

        if (process.env.ZORM_LOG_QUERIES === 'true') {
            fs.appendFileSync('./query.log', `\n${JSON.stringify({ query, data })},`)
        }

        const promise = this.client.query<R, T[]>(query, data).catch((error: DBError) => {
            error.query = query
            error.queryData = data
            return Promise.reject(error)
        })

        return DBResultPromise.from(promise)
    }

    /**
     * Release puts the client back into the database pool for it to be used again.
     * We make sure that we cannot use it again after releasing it through the "closed" check.
     */
    public release(err?: Error) {
        if (this.closed) return
        this.closed = true
        return this.client.release(err)
    }
}
