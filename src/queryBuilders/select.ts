import { Executor } from '@zaptic-external/pg-plus'
import { getDatabaseName, getFieldList, getSelectFields } from '../helpers'
import { BooleanOperator, EntityDefinition, QueryDefinitions, WhereObject } from '../types'
import { findWithNesting } from './find'
import { join, JoinOn } from './join'
import { Entity } from '../zorm'
import { Replace } from '../helpers/types'

interface SelectQuery<EntityType, SelectedFields> {
    whereClause?: string
    params: Array<unknown>
    joinClauses: string[]
    parameterCount: number
    selectFields: string[]
    orderBy?: Array<keyof (EntityType & SelectedFields)>
    order?: 'ASC' | 'DESC'
    limit?: number
    offset?: number
    groupBy?: Array<keyof (EntityType & SelectedFields)>
}

export class Select<
    EntityType,
    SelectedFields = EntityType,
    DefinitionType extends EntityDefinition<EntityType> = EntityDefinition<EntityType>
> {
    public query: SelectQuery<EntityType, SelectedFields>
    private definitions: QueryDefinitions<EntityType, DefinitionType>

    constructor(definition: DefinitionType, ...fields: Array<[string, keyof EntityType]>) {
        this.definitions = { root: definition } // Our definition is always root
        this.query = {
            parameterCount: 0,
            params: [],
            joinClauses: [],
            selectFields: getSelectFields(fields.length > 0 ? fields : getFieldList(definition), definition.tableName),
        }
    }

    public where(whereObject: WhereObject<EntityType>, operator: BooleanOperator = 'AND') {
        const { whereParams, whereClause } = findWithNesting(
            this.definitions,
            whereObject,
            this.query.parameterCount,
            operator
        )
        return this._where(whereClause, whereParams)
    }

    public _where(whereClause: string, whereParams: Array<unknown> = []) {
        this.query.whereClause = whereClause
        this.query.params.push(...whereParams)
        this.query.parameterCount += whereParams.length
        return this
    }

    public orderBy(...orderBy: Array<keyof (SelectedFields & EntityType)>) {
        this.query = { ...this.query, orderBy }
        return this
    }

    public desc() {
        this.query.order = 'DESC'
        return this
    }

    public asc() {
        this.query.order = 'ASC'
        return this
    }

    /**
     * Joins another table
     *
     * @param otherEntity - The entity we're joining on E.G. StringsEntity
     * @param alias - The alias for that entity in the future => `JOIN table AS "<alias>"`. Please note that this will
     * also set the alias for that table for the where clause and that it is case sensitive.
     * @param on - An on object is an object where each key is a key from the table we're joining on and it's value is
     * either:
     *  - a value straight up `{ slug: 'en-GB' }`
     *  - a reference using the ref function `ref('<column>')` where <column> is a column from the original entity
     *  - a nested reference { <alias>: '<column>' } where <alias> is the alias to another joined table and <column>
     *      a column from that table.
     *
     *  Example:
     *  ```
     *  .join(locationEntity, 'L', { country: ref('regionId') }, { })
     *  .join(locationOwnershipEntity, 'LO', { locationId: { L: 'locationId' } }, { })
     *  .join(stringsEntity, 'S', { lang: 'en-GB', slug: { L: 'name' }}, { })
     *  ==>
     *  JOIN location L ON (L.country = region_id)
     *  JOIN location_ownership LO ON (LO.location_id = L.location_id)
     *  JOIN strings S ON (S.lang = 'en-GB' AND S.slug = L.name)
     * ```
     *  L
     * @param fields - The fields to automatically add to the query top level note that this is for selection only
     * but can be used in order by and group by but not in where clauses.
     * @param onOperator - 'AND' or 'OR' when the on object has more than one key this determines what operator each
     * condition is done on
     */
    public join<OtherEntityType, Fields extends { [key: string]: keyof OtherEntityType }, Alias extends string>(
        // Haven't found better than any, but it's mostly irrelevant here.
        otherEntity: Entity<OtherEntityType, EntityDefinition<OtherEntityType, any>>,
        alias: Alias,
        on: JoinOn<EntityType, OtherEntityType>,
        fields: Fields,
        onOperator: 'AND' | 'OR' = 'AND'
    ): Select<
        Replace<EntityType, { [key in Alias]: Partial<OtherEntityType> }>,
        SelectedFields & { [key in keyof Fields]: OtherEntityType[Fields[key]] }
    > {
        const { parameterCount, joinFields, joinClause, joinParams } = join<EntityType, OtherEntityType, Alias, Fields>(
            'JOIN',
            otherEntity.definition,
            alias,
            this.definitions,
            on,
            this.query.parameterCount,
            fields,
            onOperator
        )
        this.query.selectFields.push(...joinFields)
        this.query.joinClauses.push(joinClause)
        this.query.parameterCount = parameterCount
        this.query.params.push(...joinParams)
        this.definitions[alias] = otherEntity.definition

        return this as any
    }

    /**
     * Left Joins another table
     *
     * @param otherEntity - The entity we're joining on E.G. StringsEntity
     * @param alias - The alias for that entity in the future => `JOIN table AS "<alias>"`. Please note that this will
     * also set the alias for that table for the where clause and that it is case sensitive.
     * @param on - An on object is an object where each key is a key from the table we're joining on and it's value is
     * either:
     *  - a value straight up `{ slug: 'en-GB' }`
     *  - a reference using the ref function `ref('<column>')` where <column> is a column from the original entity
     *  - a nested reference { <alias>: '<column>' } where <alias> is the alias to another joined table and <column>
     *      a column from that table.
     *
     *  Example:
     *  ```
     *  .leftJoin(locationEntity, 'L', { country: ref('regionId') }, { })
     *  .leftJoin(locationOwnershipEntity, 'LO', { locationId: { L: 'locationId' } }, { })
     *  .leftJoin(stringsEntity, 'S', { lang: 'en-GB', slug: { L: 'name' }}, { })
     *  ==>
     *  LEFT JOIN location L ON (L.country = region_id)
     *  LEFT JOIN location_ownership LO ON (LO.location_id = L.location_id)
     *  LEFT JOIN strings S ON (S.lang = 'en-GB' AND S.slug = L.name)
     * ```
     *  L
     * @param fields - The fields to automatically add to the query top level note that this is for selection only
     * but can be used in order by and group by but not in where clauses.
     * @param onOperator - 'AND' or 'OR' when the on object has more than one key this determines what operator each
     * condition is done on
     */
    public leftJoin<OtherEntityType, Fields extends { [key: string]: keyof OtherEntityType }, Alias extends string>(
        // Haven't found better than any, but it's mostly irrelevant here.
        otherEntity: Entity<OtherEntityType, EntityDefinition<OtherEntityType, any>>,
        alias: Alias,
        on: JoinOn<EntityType, OtherEntityType>,
        fields: Fields,
        onOperator: 'AND' | 'OR' = 'AND'
    ): Select<
        Replace<EntityType, { [key in Alias]: Partial<OtherEntityType> }>,
        SelectedFields & { [key in keyof Fields]: OtherEntityType[Fields[key]] | null }
    > {
        const { parameterCount, joinFields, joinClause, joinParams } = join<EntityType, OtherEntityType, Alias, Fields>(
            'LEFT JOIN',
            otherEntity.definition,
            alias,
            this.definitions,
            on,
            this.query.parameterCount,
            fields,
            onOperator
        )
        this.query.selectFields.push(...joinFields)
        this.query.joinClauses.push(joinClause)
        this.query.parameterCount = parameterCount
        this.query.params.push(...joinParams)
        this.definitions[alias] = otherEntity.definition

        return this as any
    }

    public limit(limit: number) {
        this.query.limit = limit
        return this
    }

    public offset(offset: number) {
        this.query.offset = offset
        return this
    }

    public addField<ExtraData extends {}>(partialSelectClause: string) {
        this.query.selectFields.push(partialSelectClause)
        return (this as any) as Select<EntityType, SelectedFields & ExtraData>
    }

    public groupBy(...keys: Array<keyof (EntityType & SelectedFields)>) {
        this.query.groupBy = keys
        return this
    }

    public execute(database: Executor) {
        const { selectFields, whereClause, orderBy, order, params, joinClauses, limit, offset, groupBy } = this.query

        let queryString = `SELECT ${selectFields.join(', ')} FROM ${this.definitions.root.tableName}`

        if (joinClauses.length) {
            joinClauses.forEach((clause) => (queryString += clause))
        }

        if (whereClause) {
            queryString += ` WHERE ${whereClause}`
        }

        if (groupBy) {
            queryString += ` GROUP BY ${groupBy
                .map((field) =>
                    isEntityField<EntityType, SelectedFields>(field, this.definitions.root)
                        ? getDatabaseName(this.definitions.root, field, true)
                        : `"${field}"`
                )
                .join(', ')}`
        }

        if (orderBy) {
            queryString += ` ORDER BY ${orderBy
                .map((field) =>
                    isEntityField<EntityType, SelectedFields>(field, this.definitions.root)
                        ? getDatabaseName(this.definitions.root, field, true)
                        : `"${field}"`
                )
                .join(',')}`
            if (order) queryString += ` ${order}`
        }

        const allParams = [...params]

        if (limit) {
            this.query.parameterCount += 1
            queryString += ` LIMIT $${this.query.parameterCount}`
            allParams.push(limit)
        }

        if (offset) {
            this.query.parameterCount += 1
            queryString += ` OFFSET $${this.query.parameterCount}`
            allParams.push(offset)
        }

        return database.executeString<unknown[], SelectedFields>(queryString, allParams)
    }
}

function isEntityField<
    EntityType,
    SelectedFields,
    DefinitionType extends EntityDefinition<EntityType> = EntityDefinition<EntityType>
>(key: keyof EntityType | keyof SelectedFields, definition: DefinitionType): key is keyof EntityType {
    return Boolean((<any>definition.fields)[key])
}
