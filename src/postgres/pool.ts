import * as pg from 'pg'
import { Executor } from './executor'

export class Pool {
    private pool: pg.Pool

    public async connect(): Promise<Executor> {
        const client = await this.pool.connect()
        return new Executor(client)
    }

    /**
     * Runs a query on a database and cleans up all used resources.
     * If you're planning on making multiple queries use `new Pool(cfg)`
     *
     * Notes:
     * If you're planning on making multiple queries use `new Pool(cfg)`
     * This will force cfg.max to 1
     */
    public static run<T>(cfg: pg.PoolConfig, fn: (database: Executor) => Promise<T>) {
        const pool = new Pool({ ...cfg, max: 1 }) // Force the max to 1 as there is no point making more in this context
        return pool.run(fn).finally(() => pool.close())
    }

    /**
     * Runs a query on a database with a transaction and cleans up all used resources.
     * If fn throws an error no changes will be saved to the database
     *
     * Notes:
     * If you're planning on making multiple queries use `new Pool(cfg)`
     * This will force cfg.max to 1
     */
    public static runInTransaction<T>(cfg: pg.PoolConfig, fn: (database: Executor) => Promise<T>) {
        const pool = new Pool({ ...cfg, max: 1 }) // Force the max to 1 as there is no point making more in this context
        return pool.runInTransaction(fn).finally(() => pool.close())
    }

    constructor(cfg: pg.PoolConfig) {
        // Force ssl
        this.pool = new pg.Pool({ ...cfg })
        // There is nothing we can really do but log this
        this.pool.on('error', (e) => console.error('[ZORM] Connection pool error', e))
    }

    /**
     * Runs a query on a database. This is for cases when you don't want to worry about releasing the executor used
     * to run the query.
     */
    public async run<T>(fn: (database: Executor) => Promise<T>) {
        const database = await this.connect()
        return fn(database).finally(() => database.release())
    }

    /**
     * Runs a query in a transaction on a database. This is for cases when you don't want to worry about releasing
     * the executor used to run the query. It will also rollback the transaction if fn throws an error.
     */
    public async runInTransaction<T>(fn: (database: Executor) => Promise<T>) {
        const database = await this.connect()
        return database.transaction(fn).finally(() => database.release())
    }

    public close() {
        return this.pool.end()
    }
}
