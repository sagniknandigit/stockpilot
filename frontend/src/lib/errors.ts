import { ApiError } from '@/api/client'

interface ValidationIssue {
  loc?: (string | number)[]
  msg?: string
}

/** Best human-readable message for any thrown value, including FastAPI validation details. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiError) {
    if (error.code === 'validation_error' && Array.isArray(error.details)) {
      const first = (error.details as ValidationIssue[])[0]
      if (first?.msg) {
        const field = first.loc?.filter((part) => part !== 'body').join('.')
        return field ? `${field}: ${first.msg}` : first.msg
      }
    }
    return error.message
  }
  if (error instanceof Error) return error.message
  return fallback
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code)
}
