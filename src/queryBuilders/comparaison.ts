// Ideal interface
// { greater(), greaterOrEqual(), less(), lessOrEqual(), not() }

import { Comparison } from '../types'

export function comparisonToWhereClause<T>(comparison: Comparison<T>, paramCount = 0) {
    const result = {
        paramCount: comparison.value == null ? paramCount : paramCount + 1,
        whereParams: comparison.value == null ? [] : [comparison.value],
    }
    switch (comparison._op) {
        case 'greater':
            return { ...result, whereClause: ` > $${result.paramCount}` }
        case 'greaterOrEqual':
            return { ...result, whereClause: ` >= $${result.paramCount}` }
        case 'less':
            return { ...result, whereClause: ` < $${result.paramCount}` }
        case 'lessOrEqual':
            return { ...result, whereClause: ` <= $${result.paramCount}` }
        case 'not':
            return { ...result, whereClause: ` != $${result.paramCount}` }
    }
}

export const greater = <T>(value: T): Comparison<T> => ({ _op: 'greater', value })
export const greaterOrEqual = <T>(value: T): Comparison<T> => ({ _op: 'greaterOrEqual', value })
export const less = <T>(value: T): Comparison<T> => ({ _op: 'less', value })
export const lessOrEqual = <T>(value: T): Comparison<T> => ({ _op: 'lessOrEqual', value })
export const not = <T>(value: T): Comparison<T> => ({ _op: 'not', value })
