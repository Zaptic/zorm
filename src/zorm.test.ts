import { Executor, Pool, sql } from '@zaptic-external/pg-plus'
import { Entity } from './zorm'
import { assert } from 'chai'
import { ref } from './queryBuilders/join'
import { greater, greaterOrEqual, less, lessOrEqual, not } from './queryBuilders/comparaison'

describe('zorm', function () {
    let database: Executor
    let pool: Pool

    before(async function () {
        await Pool.run(
            { database: 'postgres', host: 'localhost', user: 'postgres', password: 'postgres', max: 1 },
            (db) => db.execute(sql`CREATE DATABASE zorm`)
        ).catch(() => null) // Ignore as it's OK for the DB to already exist

        pool = new Pool({ database: 'zorm', host: 'localhost', user: 'postgres', password: 'postgres', max: 1 })
        database = await pool.connect()
        await database.execute(sql`DROP SCHEMA public CASCADE`)
        await database.execute(sql`CREATE SCHEMA public`)

        await database.execute(sql`
            CREATE TABLE country (
                id SERIAL NOT NULL PRIMARY KEY,
                name TEXT NOT NULL,
                region TEXT,
                is_deleted BOOLEAN DEFAULT FALSE NOT NULL
            )
        `)

        await database.execute(sql`
            CREATE TABLE location (
                id SERIAL NOT NULL PRIMARY KEY,
                name TEXT NOT NULL,
                country INT REFERENCES country(id) NOT NULL
            )
        `)

        await database.execute(sql`
            CREATE TABLE location_ownership (
                location_id INT REFERENCES location(id) NOT NULL,
                user_id INT NOT NULL
            )
        `)
    })

    beforeEach(async function () {
        await database.begin()
    })

    afterEach(async function () {
        await database.rollback()
    })

    after(async function () {
        database.release()
        await pool.close()
    })

    type Country = {
        id: number
        name: string
        region?: string | null
        isDeleted: boolean
    }

    const definition = <const>{
        tableName: 'country',
        primaryKeyFieldName: 'id',
        fields: {
            id: { hasDBDefault: true },
            name: {},
            region: { nullable: true },
            isDeleted: { hasDBDefault: true },
        },
    }

    const countryEntity = new Entity<Country, typeof definition>(definition)

    const locationDefinition = <const>{
        tableName: 'location',
        primaryKeyFieldName: 'id',
        fields: {
            id: { hasDBDefault: true },
            name: {},
            country: {},
        },
    }

    type Location = {
        id: number
        name: string
        country: number
    }

    const locationEntity = new Entity<Location, typeof locationDefinition>(locationDefinition)

    type LocationOwnership = {
        locationId: number
        userId: number
    }

    const locationOwnershipDefinition = <const>{
        tableName: 'location_ownership',
        primaryKeyFieldName: 'locationId', // This is not great at the moment
        fields: {
            locationId: {},
            userId: {},
        },
    }

    const locationOwnershipEntity = new Entity<LocationOwnership, typeof locationOwnershipDefinition>(
        locationOwnershipDefinition
    )

    const getAll = sql`SELECT name, id, is_deleted "isDeleted", region FROM country ORDER BY id`

    it('creates entities', async function () {
        const result = await countryEntity.create(database, { name: 'test', isDeleted: false, region: 'Europe' })

        const countries = await database.execute(sql`SELECT name, id, is_deleted "isDeleted", region FROM country`)

        assert.deepEqual(countries, [result])
    })

    it('gets entities', async function () {
        const created = await countryEntity.create(database, { name: 'test', isDeleted: false, region: 'Europe' })
        const result = await countryEntity.get(database, created.id).orThrow()

        assert.deepEqual(result, created)
    })

    it('builds select statements', async function () {
        await countryEntity.create(database, { name: 'UK', isDeleted: false, region: 'Europe' })
        const chance = await countryEntity.create(database, { name: 'Chance', isDeleted: false, region: 'Asia' })
        const france = await countryEntity.create(database, { name: 'France', isDeleted: false, region: 'Europe' })

        const result = await countryEntity
            .select()
            ._where(`name ~ $1`, ['anc'])
            .orderBy('region')
            .desc()
            .execute(database)

        assert.deepEqual(result, [france, chance])
    })

    it('builds select statements with fields', async function () {
        await countryEntity.create(database, { name: 'UK', isDeleted: false, region: 'Europe' })
        const chance = await countryEntity.create(database, { name: 'Chance', isDeleted: false, region: 'Asia' })
        const france = await countryEntity.create(database, { name: 'France', isDeleted: false, region: 'Europe' })

        const result = await countryEntity
            .select(['name'])
            ._where(`name ~ $1`, ['anc'])
            .orderBy('region')
            .desc()
            .execute(database)

        assert.deepEqual(
            result,
            [france, chance].map((c) => ({ name: c.name }))
        )
    })

    it('handles nulls in where clause', async function () {
        await countryEntity.create(database, { name: 'UK', isDeleted: false, region: 'Europe' })
        await countryEntity.create(database, { name: 'Chance', isDeleted: false, region: 'Asia' })
        const france = await countryEntity.create(database, { name: 'France', isDeleted: false })

        const result = await countryEntity.select().where({ region: null }).execute(database)

        assert.deepEqual(result, [france])
    })

    it('handles nulls in insert statements', async function () {
        await countryEntity.create(database, { name: 'UK', isDeleted: false, region: 'Europe' })
        await countryEntity.create(database, { name: 'Chance', isDeleted: false, region: 'Asia' })
        const france = await countryEntity.create(database, { name: 'France', isDeleted: false, region: null })

        const result = await countryEntity.select().where({ region: null }).execute(database)

        assert.deepEqual(result, [france])
    })

    it('handles ORs in select where clauses', async function () {
        await countryEntity.create(database, { name: 'UK', isDeleted: false, region: 'Europe' })
        const chance = await countryEntity.create(database, { name: 'Chance', isDeleted: false, region: 'Asia' })
        const france = await countryEntity.create(database, { name: 'France', isDeleted: false })

        const result = await countryEntity
            .select()
            .where({ region: null, name: 'Chance' }, 'OR')
            .orderBy('name')
            .desc()
            .execute(database)

        assert.deepEqual(result, [france, chance])
    })

    it('updates entities by key', async function () {
        const created = await countryEntity.create(database, { name: 'test', isDeleted: false, region: 'Europe' })
        const updated = await countryEntity
            .updateByPk(database, created.id, { name: 'New name', region: 'Asia' })
            .orThrow()

        const countries = await database.execute(getAll)

        assert.deepEqual(countries, [updated])
    })

    it('updates all the entities', async function () {
        const countries = await countryEntity.createBulk(database, [
            { name: '測試', region: 'Asia', isDeleted: false },
            { name: 'test', region: 'Europe', isDeleted: false },
            { name: "test's neighbourgh", region: 'Europe', isDeleted: false },
        ])
        const updated = await countryEntity.update({ isDeleted: true }).execute(database)

        const afterUpdate = await database.execute(getAll)

        assert.deepEqual(afterUpdate, updated)
        assert.deepEqual(
            afterUpdate,
            countries.map((country) => ({ ...country, isDeleted: true }))
        )
    })

    it('updates one entities respecting the where clause', async function () {
        const countries = await countryEntity.createBulk(database, [
            { name: '測試', region: 'Asia', isDeleted: false },
            { name: 'test', region: 'Europe', isDeleted: false },
            { name: "test's neighbourgh", region: 'Europe', isDeleted: false },
        ])

        const updated = await countryEntity.update({ isDeleted: true }).where({ name: 'test' }).execute(database)

        const afterUpdate = await database.execute(getAll)

        assert.deepEqual(updated, [{ ...countries[1], isDeleted: true }])
        assert.deepEqual(
            afterUpdate,
            countries.map((country) => ({ ...country, isDeleted: country.name === 'test' }))
        )
    })

    it('checks for existence', async function () {
        const created = await countryEntity.create(database, { name: 'test', isDeleted: false, region: 'Europe' })

        assert.deepEqual(await countryEntity.exists(database, created.id), true)
        assert.deepEqual(await countryEntity.exists(database, 0), false)
    })

    it('creates in bulk', async function () {
        const created = await countryEntity.createBulk(database, [
            { name: '測試', region: 'Asia', isDeleted: false },
            { name: 'test', region: 'Europe', isDeleted: false },
        ])

        assert.deepEqual(created, await countryEntity.select().orderBy('region').execute(database))
    })

    it('creates in bulk with missing fields in the first row', async function () {
        const created = await countryEntity.createBulk(database, [
            { id: 15, name: 'test', isDeleted: false },
            { id: 16, name: 'test 2', isDeleted: false, region: 'Americas' },
            { id: 17, name: 'test 3', isDeleted: false, region: 'Asia' },
        ])

        assert.deepEqual(created, [
            { id: 15, name: 'test', isDeleted: false, region: null },
            { id: 16, name: 'test 2', isDeleted: false, region: 'Americas' },
            { id: 17, name: 'test 3', isDeleted: false, region: 'Asia' },
        ])
    })

    it('does nothing when bulk create is passed empty array', async function () {
        assert.doesNotThrow(() => countryEntity.createBulk(database, []))
    })

    it('finds entities matching the given object', async function () {
        const expected = await countryEntity
            .createBulk(database, [
                { name: '測試', region: 'Asia', isDeleted: false },
                { name: 'test', region: 'Europe', isDeleted: false },
                { name: "test's neighbourgh", region: 'Europe', isDeleted: false },
            ])
            .filter((row) => row.region === 'Europe')

        assert.deepEqual(expected, await countryEntity.find(database, { region: 'Europe' }))
    })

    it('finds entities matching the given all properties of the given object', async function () {
        const expected = await countryEntity
            .createBulk(database, [
                { name: '測試', region: 'Asia', isDeleted: false },
                { name: 'test', region: 'Europe', isDeleted: false },
                { name: "test's neighbourgh", region: 'Europe', isDeleted: false },
            ])
            .filter((row) => row.region === 'Europe' && row.name === 'test')

        assert.deepEqual(expected, await countryEntity.find(database, { region: 'Europe', name: 'test' }))
    })

    it('finds entities matching the given one of the values when the property is an array', async function () {
        const expected = await countryEntity
            .createBulk(database, [
                { name: '測試', region: 'Asia', isDeleted: false },
                { name: 'test', region: 'Europe', isDeleted: false },
                { name: "test's neighbourgh", region: 'Europe', isDeleted: false },
            ])
            .filter((row) => ['Europe', 'Asia'].includes(row.region!))

        assert.deepEqual(expected, await countryEntity.find(database, { region: ['Europe', 'Asia'] }))
    })

    it('can do nothing on conflict during an insert', async function () {
        const existing = await countryEntity.create(database, {
            id: 15,
            name: 'test',
            isDeleted: false,
            region: 'Europe',
        })

        await countryEntity
            .insert({ id: 15, name: 'Test', isDeleted: false, region: 'Africa' })
            .onKeyConflictDoNothing('id')
            .execute(database)

        assert.deepEqual(existing, await countryEntity.getAll(database).first().orThrow())
    })

    it('can update on conflict during an insert', async function () {
        await countryEntity.create(database, {
            id: 15,
            name: 'test',
            isDeleted: false,
            region: 'Europe',
        })

        const updated = await countryEntity
            .insert({ id: 15, name: 'Test', isDeleted: false, region: 'Africa' })
            .onKeyConflictDoUpdate('id', 'name = EXCLUDED.name, region = EXCLUDED.region')
            .execute(database)

        assert.deepEqual(updated, await countryEntity.getAll(database))
        assert.deepEqual(updated, [{ id: 15, name: 'Test', isDeleted: false, region: 'Africa' }])
    })

    it('can join', async function () {
        const countries = await countryEntity.createBulk(database, [
            { id: 15, name: 'test', region: 'Europe' },
            { id: 16, name: 'test 2', region: 'Americas' },
            { id: 17, name: 'test 3', region: 'Asia' },
        ])

        const locations = await locationEntity.createBulk(database, [
            { name: 'Test 1', country: 15 },
            { name: 'Test 2', country: 15 },
            { name: 'Test 3', country: 15 },
            { name: 'Test 4', country: 16 },
        ])

        assert.sameDeepMembers(
            await locationEntity
                .select()
                .join(countryEntity, 'C', { id: ref('country') }, { regionName: 'name' })
                .execute(database),
            locations.map((location) => ({
                ...location,
                regionName: countries.find((country) => country.id === location.country)?.name,
            }))
        )
    })

    it('can use where on joined tables with aliases', async function () {
        const countries = await countryEntity.createBulk(database, [
            { id: 15, name: 'test', region: 'Europe' },
            { id: 16, name: 'test 2', region: 'Americas' },
            { id: 17, name: 'test 3', region: 'Asia' },
        ])

        const locations = await locationEntity.createBulk(database, [
            { name: 'Test 1', country: 15 },
            { name: 'Test 2', country: 15 },
            { name: 'Test 3', country: 15 },
            { name: 'Test 4', country: 16 },
        ])

        assert.sameDeepMembers(
            await locationEntity
                .select()
                .join(countryEntity, 'C', { id: ref('country') }, { regionName: 'name' })
                .where({ C: { id: 16 } })
                .execute(database),
            locations
                .filter((l) => l.name === 'Test 4')
                .map((location) => ({
                    ...location,
                    regionName: countries.find((country) => country.id === location.country)?.name,
                }))
        )
    })

    it('can left join as a new field', async function () {
        const countries = await countryEntity.createBulk(database, [{ id: 15, name: 'test', region: 'Europe' }])

        const locations = await locationEntity.createBulk(database, [{ name: 'Test 1', country: 15 }])

        assert.deepEqual(
            await locationEntity
                .select()
                .leftJoin(countryEntity, 'C', { id: ref('country') }, { regionName: 'name' })
                .leftJoin(locationOwnershipEntity, 'LO', { locationId: ref('id') }, { owner: 'userId' })
                .execute(database),
            locations.map((location) => ({
                ...location,
                owner: null,
                regionName: countries.find((country) => country.id === location.country)!.name,
            }))
        )
    })

    it('respects the given limit', async function () {
        const countries = await countryEntity.createBulk(database, [
            { id: 15, name: 'test', region: 'Europe' },
            { id: 16, name: 'test 2', region: 'Americas' },
            { id: 17, name: 'test 3', region: 'Asia' },
        ])

        assert.deepEqual(
            await countryEntity.select().orderBy('id').asc().limit(2).execute(database),
            countries.slice(0, 2)
        )
    })

    it('respects the given limit and offset', async function () {
        const countries = await countryEntity.createBulk(database, [
            { id: 15, name: 'test', region: 'Europe' },
            { id: 16, name: 'test 2', region: 'Americas' },
            { id: 17, name: 'test 3', region: 'Asia' },
        ])

        assert.deepEqual(
            await countryEntity.select().orderBy('id').asc().limit(2).offset(1).execute(database),
            countries.slice(1, 3)
        )
    })

    it('adds fields', async function () {
        const countries = await countryEntity.createBulk(database, [
            { id: 15, name: 'test', region: 'Europe' },
            { id: 16, name: 'test 2', region: 'Americas' },
            { id: 17, name: 'test 3', region: 'Asia' },
        ])

        assert.deepEqual(
            await countryEntity
                .select()
                .orderBy('id')
                .asc()
                .limit(2)
                .offset(1)
                .addField<{ one: number }>('1 "one"')
                .addField<{ count: number }>('(count(*) OVER())::int "count"')
                .execute(database),
            countries.slice(1, 3).map((c) => ({ ...c, one: 1, count: 3 }))
        )
    })

    it('deletes everything', async function () {
        const countries = await countryEntity.createBulk(database, [
            { id: 15, name: 'test', region: 'Europe' },
            { id: 16, name: 'test 2', region: 'Americas' },
            { id: 17, name: 'test 3', region: 'Asia' },
        ])

        const result = await countryEntity.deleteAll(database)
        assert.deepEqual(result, countries)
        assert.deepEqual(await countryEntity.getAll(database).count(), 0)
    })

    it('deletes where', async function () {
        const countries = await countryEntity.createBulk(database, [
            { id: 15, name: 'test', region: 'Europe' },
            { id: 16, name: 'test 2', region: 'Americas' },
            { id: 17, name: 'test 3', region: 'Asia' },
        ])

        const result = await countryEntity.deleteWhere(database, { name: 'test' })
        assert.deepEqual(result, [countries[0]])
        assert.deepEqual(await countryEntity.getAll(database), countries.slice(1))
    })

    it('can groups by', async function () {
        await countryEntity.createBulk(database, [
            { id: 15, name: 'test', region: 'Europe' },
            { id: 16, name: 'test 2', region: 'Americas' },
            { id: 17, name: 'test 3', region: 'Asia' },
        ])

        await locationEntity.createBulk(database, [
            { name: 'Test 1', country: 15 },
            { name: 'Test 2', country: 15 },
            { name: 'Test 3', country: 15 },
            { name: 'Test 4', country: 16 },
        ])

        assert.sameDeepMembers(
            await countryEntity
                .select(['name'])
                .leftJoin(locationEntity, 'L', { country: ref('id') }, {})
                .addField<{ locationCount: number }>(`count("L".id)::int "locationCount"`)
                .groupBy('id')
                .orderBy('name')
                .execute(database),
            [
                { name: 'test', locationCount: 3 },
                { name: 'test 2', locationCount: 1 },
                { name: 'test 3', locationCount: 0 },
            ]
        )
    })

    it('can join twice on the same table with aliases', async function () {
        await countryEntity.createBulk(database, [{ id: 15, name: 'test', region: 'Europe' }])

        await locationEntity.createBulk(database, [
            { name: 'Test 1', country: 15 },
            { name: 'Test 2', country: 15 },
        ])

        assert.sameDeepMembers(
            await countryEntity
                .select(['name'])
                .leftJoin(locationEntity, 'L1', { country: ref('id') }, { name1: 'name' })
                .leftJoin(locationEntity, 'L2', { country: ref('id') }, { name2: 'name' })
                .orderBy('name', 'name1', 'name2')
                .execute(database),
            [
                { name: 'test', name1: 'Test 1', name2: 'Test 1' },
                { name: 'test', name1: 'Test 1', name2: 'Test 2' },
                { name: 'test', name1: 'Test 2', name2: 'Test 1' },
                { name: 'test', name1: 'Test 2', name2: 'Test 2' },
            ]
        )
    })

    it('can join on joins', async function () {
        const countries = await countryEntity.createBulk(database, [{ id: 15, name: 'test', region: 'Europe' }])

        const locations = await locationEntity.createBulk(database, [{ name: 'Test 1', country: 15 }])

        assert.deepEqual(
            await countryEntity
                .select()
                .leftJoin(locationEntity, 'L', { country: ref('id') }, { locationName: 'name' })
                .leftJoin(locationOwnershipEntity, 'LO', { locationId: { L: 'id' } }, { owner: 'userId' })
                .execute(database),
            countries.map((country) => ({
                ...country,
                owner: null,
                locationName: locations.find((location) => location.country === country.id)!.name,
            }))
        )
    })

    it('can join using values and references', async function () {
        await countryEntity.createBulk(database, [{ id: 15, name: 'test', region: 'Europe' }])

        await locationEntity.createBulk(database, [
            { name: 'Test 1', country: 15 },
            { name: 'Test 2', country: 15 },
        ])

        assert.sameDeepMembers(
            await countryEntity
                .select(['name'])
                .leftJoin(locationEntity, 'L', { country: ref('id'), name: 'Test 1' }, { locationName: 'name' })
                .execute(database),
            [{ name: 'test', locationName: 'Test 1' }]
        )
    })

    it('can join using values and where clauses in the same query', async function () {
        await countryEntity.createBulk(database, [{ id: 15, name: 'test', region: 'Europe' }])

        await locationEntity.createBulk(database, [
            { name: 'Test 1', country: 15 },
            { name: 'Test 2', country: 15 },
        ])

        assert.sameDeepMembers(
            await countryEntity
                .select(['name'])
                .leftJoin(locationEntity, 'L', { country: ref('id'), name: 'Test 1' }, { locationName: 'name' })
                .where({ id: 15 })
                .execute(database),
            [{ name: 'test', locationName: 'Test 1' }]
        )
    })

    it('can join using values or references', async function () {
        await countryEntity.createBulk(database, [
            { id: 15, name: 'test', region: 'Europe' },
            { id: 16, name: 'test2', region: 'Europe' },
        ])

        await locationEntity.createBulk(database, [
            { name: 'Test 1', country: 16 },
            { name: 'Test 2', country: 15 },
        ])

        assert.sameDeepMembers(
            await countryEntity
                .select(['name'])
                .leftJoin(locationEntity, 'L', { country: ref('id'), name: 'Test 1' }, { locationName: 'name' }, 'OR')
                .orderBy('name', 'locationName')
                .execute(database),
            [
                { name: 'test', locationName: 'Test 1' },
                { name: 'test', locationName: 'Test 2' },
                { name: 'test2', locationName: 'Test 1' },
            ]
        )
    })

    it('supports custom types', async function () {
        type CustomPostgresTypes = 'user_state' | 'user_email_state'

        type User = {
            id: number
            state: 'active' | 'invited' | 'blocked'
            emailState: 'sent' | 'seen' | 'clicked' | 'errored'
        }

        const validDefinition = <const>{
            tableName: 'user',
            primaryKeyFieldName: 'id',
            fields: { id: {}, state: { type: 'user_state' }, emailState: { type: 'user_email_state' } },
        }

        new Entity<User, typeof validDefinition, CustomPostgresTypes>(validDefinition)

        // The definition should not work if the custom types are not passed in
        // @ts-expect-error
        new Entity<User, typeof validDefinition>(validDefinition)

        const invalidDefinition = <const>{
            tableName: 'user',
            primaryKeyFieldName: 'id',
            fields: { id: {}, state: { type: 'user_state' }, emailState: { type: 'wrong' } },
        }

        // The definition should not work if the custom types are spelled wrong in the definition
        // @ts-expect-error
        new Entity<User, typeof validDefinition, CustomPostgresTypes>(invalidDefinition)
    })

    it('supports comparisons', async function () {
        const countries = await countryEntity.createBulk(database, [
            { id: 1, name: '測試', region: 'Asia', isDeleted: false },
            { id: 2, name: 'test', region: 'Europe', isDeleted: false },
            { id: 3, name: "test's neighbourgh", region: 'Europe', isDeleted: false },
        ])

        assert.deepEqual(await countryEntity.find(database, { id: greater(2) }), countries.slice(2))
        assert.sameDeepMembers(await countryEntity.find(database, { id: greaterOrEqual(2) }), countries.slice(1))
        assert.deepEqual(await countryEntity.find(database, { id: less(2) }), countries.slice(0, 1))
        assert.deepEqual(await countryEntity.find(database, { id: lessOrEqual(2) }), countries.slice(0, 2))
        assert.deepEqual(await countryEntity.find(database, { id: not(1) }), countries.slice(1))
    })
})
