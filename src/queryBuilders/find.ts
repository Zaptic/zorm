import { getDatabaseName, getDatabaseType } from '../helpers'
import { BooleanOperator, EntityDefinition } from '../types'

export function find<EntityType, DefinitionType extends EntityDefinition<EntityType> = EntityDefinition<EntityType>>(
    definition: DefinitionType,
    whereObject: { [key in keyof Partial<EntityType>]: EntityType[key] | Array<EntityType[key]> },
    paramCountStart = 0,
    operator: BooleanOperator = 'AND',
    tableAlias: string | null = null
) {
    const whereParts: string[] = []
    const whereParams: Array<unknown> = []
    let parameterCount = paramCountStart

    for (const key in whereObject) {
        const paramValue = whereObject[key]

        // Had to put any here :(, please do better if you can
        const part = findOne<EntityType, DefinitionType>(definition, key, paramValue as any, parameterCount, tableAlias)

        parameterCount = part.paramCount
        whereParts.push(part.whereClause)
        whereParams.push(...part.whereParams)
    }

    return { whereClause: whereParts.join(` ${operator} `), whereParams, parameterCount }
}

/**
 * In the select builder we want to keep track of all the joined tables. To do that we need to keep their definitions
 * so we can reference them properly. The convention is that joined tables will have their definitions in the
 * definitions object such that root is our current (default) table and that each key is the name of the field from the
 * root entity that was joined on.
 */
export function findWithNesting<
    EntityType,
    DefinitionType extends EntityDefinition<EntityType> = EntityDefinition<EntityType>
>(
    definitions: { [key: string]: EntityDefinition<any>; root: DefinitionType },
    whereObject: { [key in keyof Partial<EntityType>]: EntityType[key] | Array<EntityType[key]> },
    paramCountStart = 0,
    operator: BooleanOperator = 'AND'
) {
    const whereParts: string[] = []
    const whereParams: Array<unknown> = []
    let parameterCount = paramCountStart

    for (const key in whereObject) {
        const paramValue = whereObject[key]

        if (paramValue && !Array.isArray(paramValue) && typeof paramValue === 'object') {
            // In this case we have a nested object so we want to resolve with the proper definition
            const part = find(definitions[key], paramValue, parameterCount, 'AND', key)

            parameterCount = part.parameterCount
            whereParts.push(part.whereClause)
            whereParams.push(...part.whereParams)
        } else {
            // Had to put any here :(, please do better if you can
            const part = findOne<EntityType, DefinitionType>(definitions.root, key, paramValue as any, parameterCount)

            parameterCount = part.paramCount
            whereParts.push(part.whereClause)
            whereParams.push(...part.whereParams)
        }
    }

    return { whereClause: whereParts.join(` ${operator} `), whereParams, parameterCount }
}

function findOne<
    EntityType,
    DefinitionType extends EntityDefinition<EntityType> = EntityDefinition<EntityType>,
    Key extends keyof EntityType = keyof EntityType
>(definition: DefinitionType, key: Key, value: EntityType[Key], paramCount = 0, tableAlias: string | null = null) {
    const dbFieldName = tableAlias
        ? `"${tableAlias}".${getDatabaseName(definition, key, false)}`
        : getDatabaseName(definition, key, true)

    const result = {
        paramCount: value !== null ? paramCount + 1 : paramCount, // Because we use IS NULL for the null case
        whereParams: value !== null ? [value] : [],
    }

    if (value === null) return { ...result, whereClause: `${dbFieldName} IS NULL` }

    if (Array.isArray(value)) {
        const paramType = getDatabaseType(definition, key, value[0])
        return { ...result, whereClause: `${dbFieldName} = ANY($${result.paramCount}::${paramType}[])` }
    } else {
        const paramType = getDatabaseType(definition, key, value)
        return { ...result, whereClause: `${dbFieldName} = $${result.paramCount}::${paramType}` }
    }
}
