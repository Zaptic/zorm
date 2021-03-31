import { Executor } from './postgres/executor'
import { getFieldList } from './helpers'
import * as Builders from './queryBuilders'
import { EntityDefinition, InsertableEntity, WhereObject } from './types'

export class Entity<
    EntityType,
    DefinitionType extends EntityDefinition<EntityType, CustomTypes> = EntityDefinition<EntityType, never>,
    CustomTypes extends string = never
> {
    public readonly definition: DefinitionType

    constructor(definition: DefinitionType) {
        this.definition = definition
        // Defaults
        this.definition.primaryKeyFieldName = definition.primaryKeyFieldName || ('id' as keyof EntityType)
    }

    public select(): Builders.Select<EntityType, EntityType, DefinitionType>
    public select<K extends keyof EntityType>(
        fields: K[]
    ): Builders.Select<EntityType, Pick<EntityType, K>, DefinitionType>
    public select<K extends keyof EntityType>(fields?: K[]): any {
        return new Builders.Select(this.definition, ...getFieldList(this.definition, fields))
    }

    public getAll(database: Executor) {
        return this.select().execute(database)
    }

    public get(database: Executor, key: EntityType[DefinitionType['primaryKeyFieldName']]) {
        // We need to typecast here because typescript defaults to resolving { [anything]: ... } to { [string]: ... }
        return this.select()
            .where({ [this.definition.primaryKeyFieldName]: key } as WhereObject<EntityType>)
            .execute(database)
            .first()
    }

    public find(database: Executor, whereObject: WhereObject<EntityType>) {
        return this.select().where(whereObject).execute(database)
    }

    public exists(database: Executor, key: EntityType[DefinitionType['primaryKeyFieldName']]) {
        return this.get(database, key)
            .map(() => true)
            .withDefault(false)
    }

    public insert<T extends InsertableEntity<EntityType, DefinitionType>>(entity: T | T[]) {
        return new Builders.Insert<EntityType, DefinitionType>(this.definition, entity)
    }

    public create(database: Executor, newEntity: InsertableEntity<EntityType, DefinitionType>) {
        return this.insert(newEntity).execute(database).first().orThrow()
    }

    public createBulk<
        T extends InsertableEntity<EntityType, DefinitionType> = InsertableEntity<EntityType, DefinitionType>
    >(database: Executor, newEntities: T[]) {
        return this.insert(newEntities).execute(database)
    }

    public update(newEntity: Partial<EntityType>) {
        return new Builders.Update<EntityType, DefinitionType>(this.definition, newEntity)
    }

    public updateByPk(
        database: Executor,
        key: EntityType[DefinitionType['primaryKeyFieldName']],
        newEntity: Partial<EntityType>
    ) {
        return this.update(newEntity)
            .where({ [this.definition.primaryKeyFieldName]: key } as WhereObject<EntityType>)
            .execute(database)
            .first()
    }

    public delete() {
        return new Builders.Delete<EntityType, DefinitionType>(this.definition)
    }

    public deleteAll(database: Executor) {
        return new Builders.Delete<EntityType, DefinitionType>(this.definition).execute(database)
    }

    public deleteWhere(database: Executor, where: WhereObject<EntityType>) {
        return new Builders.Delete<EntityType, DefinitionType>(this.definition).where(where).execute(database)
    }
}
