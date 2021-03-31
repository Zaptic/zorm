import { Executor } from '../postgres/executor'
import { getFieldList } from '../helpers'
import { EntityDefinition, WhereObject } from '../types'
import { find } from './find'

interface DeleteQuery {
    returnFields: string[]
    whereClause?: string
    whereParams?: Array<unknown>
    parameterCount: number
}

export class Delete<EntityType, DefinitionType extends EntityDefinition<EntityType> = EntityDefinition<EntityType>> {
    public query: DeleteQuery = {
        returnFields: [],
        whereParams: [],
        parameterCount: 0,
    }

    constructor(private definition: DefinitionType) {
        getFieldList(this.definition).forEach((names) => {
            const databaseFieldName = names[0]
            const typescriptFieldName = names[1]

            // Make sure we are returning everything
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            this.query.returnFields.push(`${databaseFieldName} AS "${typescriptFieldName}"`)
        })

        return this
    }

    public where(whereObject: WhereObject<EntityType>): Delete<EntityType, DefinitionType>
    public where(whereClause: string, whereParams: Array<unknown>): Delete<EntityType, DefinitionType>
    public where(
        whereClause: string | WhereObject<EntityType>,
        whereParams?: Array<unknown>
    ): Delete<EntityType, DefinitionType> {
        this.query =
            typeof whereClause === 'string'
                ? { ...this.query, whereParams, whereClause }
                : { ...this.query, ...find(this.definition, whereClause, this.query.parameterCount) }

        return this
    }

    public execute(database: Executor) {
        const { returnFields, whereClause, whereParams } = this.query

        let queryString = `DELETE FROM ${this.definition.tableName}`

        if (whereClause) {
            queryString += ` WHERE ${whereClause}`
        }

        queryString += ` RETURNING ${returnFields.join(', ')}`

        return database.executeString<unknown, EntityType>(queryString, whereParams)
    }
}
