import { ArrayOrValue } from './helpers/types'

interface Reference<ReferenceDatabaseType> {
    entity: EntityDefinition<ReferenceDatabaseType>
    field: keyof ReferenceDatabaseType
}

export type BooleanOperator = 'AND' | 'OR'

export type PostgresType =
    | 'uuid'
    | 'timestamp'
    | 'timestamptz'
    | 'text'
    | 'int'
    | 'bigint'
    | 'float'
    | 'jsonb'
    | 'boolean'
    | 'point'
    | 'tstzrange'
    | 'tsvector'
    | 'interval'

export interface FieldDefinition<
    EntityType,
    FieldType extends EntityType[keyof EntityType],
    CustomTypes extends string = string,
    Ref = any
> {
    name?: string
    references?: Reference<Ref>
    hasDBDefault?: boolean
    nullable?: boolean
    generator?: Generator<EntityType, FieldType>
    type?: PostgresType | CustomTypes
}

export interface Generator<
    EntityType,
    FieldType extends EntityType[keyof EntityType],
    Dep extends keyof EntityType = keyof EntityType
> {
    fn?: (arg?: Pick<EntityType, Dep>) => FieldType
    deps?: Dep[]
}

export interface EntityDefinition<EntityType, CustomTypes extends string = string> {
    tableName: string
    primaryKeyFieldName: keyof EntityType
    fields: { [FieldName in keyof EntityType]: FieldDefinition<EntityType, EntityType[FieldName], CustomTypes> }
}

/**
 * Extracts all the field names for fields that have defaults from the given type / definition
 */
type FieldsWithDefaults<
    EntityType,
    Fields extends { [FieldName in keyof EntityType]: FieldDefinition<EntityType, EntityType[FieldName]> }
> = { [K in keyof Fields]: Fields[K] extends { hasDBDefault: boolean } ? K : never }[keyof Fields]

/**
 * Extracts all the field names for fields that can be null from the given type / definition
 */
type NullableFields<
    EntityType,
    Fields extends { [FieldName in keyof EntityType]: FieldDefinition<EntityType, EntityType[FieldName]> }
> = { [K in keyof Fields]: Fields[K] extends { nullable: boolean } ? K : never }[keyof Fields]

/**
 * All the field names that are optional when inserting
 */
type OptionalInsertFields<
    EntityType,
    Fields extends { [FieldName in keyof EntityType]: FieldDefinition<EntityType, EntityType[FieldName]> }
> = NullableFields<EntityType, Fields> | FieldsWithDefaults<EntityType, Fields>

/**
 * Used for inserts and such - represents the mandatory parts of an entity
 */
export type InsertableEntity<
    EntityType,
    DefinitionType extends EntityDefinition<EntityType> = EntityDefinition<EntityType>
> = Omit<EntityType, OptionalInsertFields<EntityType, DefinitionType['fields']>> &
    Partial<Pick<EntityType, OptionalInsertFields<EntityType, DefinitionType['fields']>>>

export type ComparisonOperation = 'greater' | 'greaterOrEqual' | 'less' | 'lessOrEqual' | 'not'
export type Comparison<T> = { _op: ComparisonOperation; value: T }

export function isComparison<T>(object: any | Comparison<T>): object is Comparison<T> {
    return object && object._op !== undefined
}

export type WhereObject<EntityType> = {
    [key in keyof Partial<EntityType>]: ArrayOrValue<EntityType[key]> | Comparison<EntityType[key]>
}

export type QueryDefinitions<
    QueryEntity,
    QueryEntityDefinition extends EntityDefinition<QueryEntity> = EntityDefinition<QueryEntity>
> = {
    [key: string]: EntityDefinition<any>
    root: QueryEntityDefinition
}
