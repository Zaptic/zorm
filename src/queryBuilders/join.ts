import { getDatabaseName, getFieldList } from '../helpers'
import { EntityDefinition, QueryDefinitions } from '../types'

export function join<
    Query,
    JoinedTable,
    Alias extends string,
    Fields extends { [key: string]: keyof JoinedTable },
    QueryDefinition extends EntityDefinition<Query> = EntityDefinition<Query>,
    JoinedTableDefinition extends EntityDefinition<JoinedTable> = EntityDefinition<JoinedTable>
>(
    type: 'JOIN' | 'LEFT JOIN',
    joinedTableDefinition: JoinedTableDefinition,
    alias: Alias,
    queryDefinitions: QueryDefinitions<Query, QueryDefinition>,
    on: JoinOn<Query, JoinedTable>,
    paramCountStart: number,
    fields: Fields,
    onOperator: 'AND' | 'OR' = 'AND'
) {
    const fieldsMap = new Map(Object.entries(fields).map(([key, value]) => [value, key]))

    const joinFields = getFieldList(joinedTableDefinition, Object.values(fields)).map(
        ([dbFieldName, tsFieldName]) => `"${alias}".${dbFieldName} as "${fieldsMap.get(tsFieldName)}"`
    )

    let paramCount = paramCountStart
    const joinParams: Array<unknown> = []
    const onClauses: string[] = []

    for (const joinedTableField in on) {
        const joinObject = on[joinedTableField]

        const joinedTableFieldDBName = `"${alias}".${getDatabaseName(joinedTableDefinition, joinedTableField, false)}`

        if (!joinObject) {
            onClauses.push(`${joinedTableFieldDBName} IS NULL`)
        } else if (typeof joinObject !== 'object' || joinObject instanceof Date) {
            joinParams.push(joinObject)
            onClauses.push(`${joinedTableFieldDBName} = $${++paramCount}`)
        } else if (isRef(joinObject)) {
            const referencedField = getDatabaseName(queryDefinitions.root, joinObject.__ref, true)
            onClauses.push(`${joinedTableFieldDBName} = ${referencedField}`)
        } else if (isNestedRef<Query>(joinObject)) {
            for (const joinObjectAlias in joinObject) {
                const referencedField = getDatabaseName(
                    queryDefinitions[joinObjectAlias],
                    joinObject[joinObjectAlias],
                    false
                )
                onClauses.push(`${joinedTableFieldDBName} = "${joinObjectAlias}".${referencedField}`)
            }
        } else {
            throw new Error(`Unable to join field ${joinedTableField} on ${on[joinedTableField]}`)
        }
    }

    return {
        parameterCount: paramCount,
        joinFields,
        joinClause: ` ${type} ${joinedTableDefinition.tableName} "${alias}" ON (${onClauses.join(` ${onOperator} `)})`,
        joinParams,
    }
}

export type JoinOn<LeftEntity, RightEntity> = {
    [Key in keyof Partial<RightEntity>]: RightEntity[Key] | JoinRef<LeftEntity> | NestedRef<LeftEntity> | null
}

type NestedRef<Left> = {
    [Key in keyof Partial<Left>]: keyof Left[Key]
}

function isNestedRef<Left>(value: NestedRef<Left> | any): value is NestedRef<Left> {
    return typeof value === 'object'
}

type JoinRef<EntityType, Key extends keyof EntityType = keyof EntityType> = { __ref: Key }

export function ref<EntityType, Key extends keyof EntityType>(key: Key): JoinRef<EntityType, Key> {
    return { __ref: key }
}

function isRef<EntityType, Key extends keyof EntityType>(
    value: JoinRef<EntityType, Key> | any
): value is JoinRef<EntityType, Key> {
    return value.__ref
}
