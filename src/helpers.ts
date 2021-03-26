import snakeCase from 'lodash.snakecase'
import { EntityDefinition, PostgresType, Generator } from './types'

/**
 * Returns the database name of the given field for the given definition
 */
export function getDatabaseName<EntityType>(
    definition: EntityDefinition<EntityType>,
    field: keyof EntityType,
    includeTableName = false
) {
    if (includeTableName) {
        return `${definition.tableName}.${definition.fields[field].name || snakeCase(<string>field)}`
    }
    return definition.fields[field].name || snakeCase(<string>field)
}

/**
 * Returns an array of tuples [A, B] where A is the database column name and B the typescript name for the fields
 */
export function getFieldList<EntityType>(definition: EntityDefinition<EntityType>, fields?: Array<keyof EntityType>) {
    const fieldList: Array<[string, keyof EntityType]> = []

    for (const fieldName in definition.fields) {
        if (fields && !fields.includes(fieldName)) continue
        // Either use the defined name or the snake cased name
        fieldList.push([`"${getDatabaseName(definition, fieldName)}"`, fieldName])
    }

    return fieldList
}

/**
 * Returns the given fields, formatted for a select or returning statement
 */
export function getSelectFields<EntityType>(fields: Array<[string, keyof EntityType]>, table: string) {
    return fields.map(
        ([databaseFieldName, typescriptFieldName]) => `${table}.${databaseFieldName} AS "${typescriptFieldName}"`
    )
}

export function getDatabaseType<EntityType>(
    definition: EntityDefinition<EntityType>,
    field: keyof EntityType,
    value: unknown
) {
    return definition.fields[field].type || inferDatabaseType(value)
}

/**
 * Infers most common types
 */
function inferDatabaseType(field: unknown): PostgresType {
    if (typeof field === 'number') return 'int'
    if (typeof field === 'string') return 'text'
    if (typeof field === 'boolean') return 'boolean'
    if (typeof field === 'object') {
        if (typeof (<any>field)?.toUTCString === 'function') return 'timestamptz'

        return 'jsonb'
    }
    throw new Error(`Unable to infer postgres type for ${field}`)
}

export function buildGenerator<
    EntityType,
    FieldType extends EntityType[keyof EntityType],
    Dep extends keyof EntityType = never
>(fn?: (arg?: Pick<EntityType, Dep>) => FieldType, deps?: Dep[]): Generator<EntityType, FieldType, Dep> {
    return {
        fn,
        deps,
    }
}
