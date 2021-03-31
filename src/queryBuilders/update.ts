import { Executor } from '../postgres/executor'
import { getDatabaseType, getFieldList } from '../helpers'
import { EntityDefinition, WhereObject } from '../types'
import { find } from './find'

interface UpdateQuery {
    updateFields: string[]
    updateParams: Array<unknown>
    returnFields: string[]
    whereClause?: string
    whereParams?: Array<unknown>
    parameterCount: number
}

export class Update<EntityType, DefinitionType extends EntityDefinition<EntityType> = EntityDefinition<EntityType>> {
    public query: UpdateQuery = {
        updateFields: [],
        updateParams: [],
        returnFields: [],
        whereParams: [],
        parameterCount: 0,
    }

    constructor(private definition: DefinitionType, newEntity: Partial<EntityType>) {
        let parameterCount = this.query.parameterCount

        getFieldList(this.definition).forEach((names) => {
            const databaseFieldName = names[0]
            const typescriptFieldName = names[1]

            // Make sure we are returning everything
            this.query.returnFields.push(`${databaseFieldName} AS "${typescriptFieldName}"`)

            if (newEntity[typescriptFieldName] === undefined) return
            const databaseType = getDatabaseType(this.definition, typescriptFieldName, newEntity[typescriptFieldName])

            if (databaseType === 'jsonb') this.query.updateParams.push(JSON.stringify(newEntity[typescriptFieldName]))
            else this.query.updateParams.push(newEntity[typescriptFieldName])
            this.query.updateFields.push(`${databaseFieldName} = $${++parameterCount}::${databaseType}`)
        })

        this.query.parameterCount = parameterCount

        return this
    }

    public where(whereObject: WhereObject<EntityType>): Update<EntityType, DefinitionType>
    public where(whereClause: string, whereParams: Array<unknown>): Update<EntityType, DefinitionType>
    public where(
        whereClause: string | WhereObject<EntityType>,
        whereParams?: Array<unknown>
    ): Update<EntityType, DefinitionType> {
        this.query =
            typeof whereClause === 'string'
                ? { ...this.query, whereParams, whereClause }
                : { ...this.query, ...find(this.definition, whereClause, this.query.parameterCount) }

        return this
    }

    public execute(database: Executor) {
        const { updateFields, updateParams, returnFields, whereClause, whereParams } = this.query

        let queryString = `UPDATE ${this.definition.tableName} SET ${updateFields.join(', ')}`

        if (whereClause) {
            queryString += ` WHERE ${whereClause}`
        }

        queryString += ` RETURNING ${returnFields.join(', ')}`

        return database.executeString<unknown, EntityType>(queryString, updateParams.concat(whereParams))
    }
}
