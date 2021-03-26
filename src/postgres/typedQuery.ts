import memoize from 'lodash.memoize'

export type Pivotted<T> = {
    [P in keyof T]: Array<T[P]>
}

export function pivotAttributes<T extends {}, K extends keyof T = keyof T>(
    objects: Array<T>,
    ...attributes: K[]
): Pivotted<Pick<T, K>> {
    return objects.reduce(
        (accum, obj) => {
            attributes.forEach((field) => {
                if (accum[field]) accum[field].push(obj[field])
                else accum[field] = [obj[field]]
                return accum
            })
            return accum
        },
        {} as Pivotted<Pick<T, K>> // tslint:disable-line
    )
}

function replacePlaceholders<Input>(query: string) {
    const parameterOrder: Array<keyof Input> = []
    // If the strings is `SELECT * FROM table WHERE a = :test::int OR b =:other` Then
    // First call: { fullMatch: ' :test', prefix: ' ', paramName: 'test' }
    // Second call { fullMatch: '::int', prefix: ':', paramName: 'int' }
    // Third call { fullMatch: '=:other', prefix: '=', paramName: 'other' }
    const parametrisedQuery = query.replace(/(.):([a-zA-Z]+[0-9]*)/g, (fullMatch, prefix, paramName) => {
        if (prefix === ':') return fullMatch

        // If the parameter name was never seen before then add it to the order
        if (!parameterOrder.includes(paramName)) parameterOrder.push(paramName)
        const paramPosition = parameterOrder.indexOf(paramName) + 1

        return `${prefix}$${paramPosition}`
    })

    return { parametrisedQuery, parameterOrder }
}

// So that the server does not re-iterate through the string at each endpoint call
const cachedReplacePlaceholders = memoize(replacePlaceholders)

export class TypedQuery<Input extends {}, Output extends {}> {
    public rows: Output[] = [] // Dummy parameter so typescript does not complain about Output type being unused

    public rawQuery: string
    public parametrisedQuery: string
    public parameterOrder: Array<keyof Input> = []

    constructor(rawQuery: string) {
        this.rawQuery = rawQuery
        const result = cachedReplacePlaceholders(rawQuery)

        this.parametrisedQuery = result.parametrisedQuery
        this.parameterOrder = result.parameterOrder
    }

    public getParameterArray(parameters: Input): Array<Input[keyof Input]> {
        return this.parameterOrder.map((parameterName) => parameters[parameterName])
    }
}

export function sql<Input extends {} = never, Output extends {} = never>(
    strings: TemplateStringsArray,
    ...substitutions: any[]
) {
    if (substitutions.length || strings.length > 1) {
        throw new Error('This template is not meant to be used with substitutions, use named parameters instead')
    }

    return new TypedQuery<Input, Output>(strings[0])
}
