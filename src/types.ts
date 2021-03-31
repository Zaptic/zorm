interface Reference<ReferenceDatabaseType> {
    entity: EntityDefinition<ReferenceDatabaseType>
    field: keyof ReferenceDatabaseType
}

export type BooleanOperator = 'AND' | 'OR'

type CustomTypes = 'user_type' | 'api_token_status' | 'email_status'

export type PostgresType =
    | 'uuid'
    | 'timestamptz'
    | 'text'
    | 'int'
    | 'float'
    | 'jsonb'
    | 'boolean'
    | 'point'
    | 'tstzrange'
    | 'tsvector'
    | CustomTypes

export interface FieldDefinition<EntityType, FieldType extends EntityType[keyof EntityType], Ref = any> {
    name?: string
    references?: Reference<Ref>
    hasDBDefault?: boolean
    nullable?: boolean
    generator?: Generator<EntityType, FieldType>
    type?: PostgresType
}

export interface Generator<
    EntityType,
    FieldType extends EntityType[keyof EntityType],
    Dep extends keyof EntityType = keyof EntityType
> {
    fn?: (arg?: Pick<EntityType, Dep>) => FieldType
    deps?: Dep[]
}

export interface EntityDefinition<EntityType> {
    tableName: string
    primaryKeyFieldName: keyof EntityType
    fields: { [FieldName in keyof EntityType]: FieldDefinition<EntityType, EntityType[FieldName]> }
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

export type WhereObject<EntityType> = { [key in keyof Partial<EntityType>]: EntityType[key] | Array<EntityType[key]> }

export type QueryDefinitions<
    QueryEntity,
    QueryEntityDefinition extends EntityDefinition<QueryEntity> = EntityDefinition<QueryEntity>
> = {
    [key: string]: EntityDefinition<any>
    root: QueryEntityDefinition
}
