import { Executor, DBResultPromise } from '@zaptic-external/pg-plus'
import { QueryResult } from 'pg'
import { getDatabaseName, getDatabaseType, getFieldList } from '../helpers'
import { EntityDefinition, InsertableEntity, PostgresType } from '../types'
import { isArray } from '../helpers/types'

interface InsertQuery {
    insertPlaceholders: string[]
    insertParams: Array<unknown>
    insertFields: string[]
    returnFields: string[]
    conflictClause: string
    isBulk: boolean
}

function getParameter<CustomTypes extends string>(databaseType: PostgresType | CustomTypes, value: unknown) {
    if (value == null) return null
    if (databaseType === 'jsonb') return JSON.stringify(value)
    return value
}

export class Insert<EntityType, DefinitionType extends EntityDefinition<EntityType> = EntityDefinition<EntityType>> {
    public query: InsertQuery = {
        insertPlaceholders: [],
        insertParams: [],
        insertFields: [],
        returnFields: [],
        conflictClause: '',
        isBulk: false,
    }

    constructor(
        private definition: DefinitionType,
        newEntities: InsertableEntity<EntityType, DefinitionType> | Array<InsertableEntity<EntityType, DefinitionType>>
    ) {
        if (isArray(newEntities)) {
            if (newEntities.length === 0) {
                return this
            }
            this.query.isBulk = true
        } else {
            this.query.isBulk = false
        }

        let parameterCount = 0

        getFieldList(this.definition).forEach((names) => {
            const databaseFieldName = names[0]
            // Have to convert to unknown first because TS does not realise that PartialEntity and EntityType overlap
            const typescriptFieldName = (names[1] as unknown) as keyof InsertableEntity<EntityType, DefinitionType>

            // Make sure we are returning everything
            this.query.returnFields.push(`${databaseFieldName} AS "${typescriptFieldName}"`)

            if (isArray(newEntities)) {
                if (newEntities[0][typescriptFieldName] === undefined) return

                const databaseType = getDatabaseType(
                    this.definition,
                    typescriptFieldName,
                    newEntities[0][typescriptFieldName]
                )

                this.query.insertParams.push(
                    newEntities.map((entity) => getParameter(databaseType, entity[typescriptFieldName]))
                )
                this.query.insertFields.push(databaseFieldName)
                this.query.insertPlaceholders.push(`$${++parameterCount}::${databaseType}[]`)
            } else {
                if (newEntities[typescriptFieldName] === undefined) return

                const databaseType = getDatabaseType(
                    this.definition,
                    typescriptFieldName,
                    newEntities[typescriptFieldName]
                )

                this.query.insertParams.push(getParameter(databaseType, newEntities[typescriptFieldName]))
                this.query.insertPlaceholders.push(`$${++parameterCount}::${databaseType}`)
                this.query.insertFields.push(databaseFieldName)
            }
        })

        return this
    }

    public onKeyConflictDoNothing(key: keyof EntityType) {
        this.query.conflictClause = `ON CONFLICT (${getDatabaseName(this.definition, key)}) DO NOTHING`
        return this
    }

    public onKeyConflictDoUpdate(key: keyof EntityType, set?: string) {
        this.query.conflictClause = `ON CONFLICT (${getDatabaseName(this.definition, key)}) DO UPDATE SET ${set}`
        return this
    }

    public onConstraintConflictDoNothing(constraint: string) {
        this.query.conflictClause = `ON CONFLICT ON CONSTRAINT ${constraint} DO NOTHING`
        return this
    }

    public onConstraintConflictDoUpdate(constraint: string, set: string) {
        this.query.conflictClause = `ON CONFLICT ON CONSTRAINT ${constraint} DO UPDATE SET ${set}`
        return this
    }

    public execute(database: Executor): DBResultPromise<EntityType> {
        if (this.query.insertParams.length === 0) {
            return DBResultPromise.from<EntityType>(Promise.resolve({ rows: [], rowCount: 0 } as QueryResult<never>))
        }

        const selectStatement = this.query.isBulk
            ? `SELECT * FROM unnest(${this.query.insertPlaceholders.join(', ')})`
            : `SELECT ${this.query.insertPlaceholders.join(', ')}`

        const query = `
            INSERT INTO ${this.definition.tableName} (${this.query.insertFields.join(', ')})
            ${selectStatement}
            ${this.query.conflictClause}
            RETURNING ${this.query.returnFields.join(', ')}
        `

        return database.executeString<unknown[], EntityType>(query, this.query.insertParams)
    }
}
