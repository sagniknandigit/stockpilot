import { z } from 'zod'
import { isValidAmount } from './money'

/**
 * Form fields are kept as strings (what inputs produce) and validated here; submit handlers
 * convert them to API types. This mirrors the backend constraints so users see errors early.
 */
export const moneyField = (label = 'Amount') =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine(isValidAmount, `${label} must be a positive amount with up to 2 decimals`)

export const optionalMoneyField = (label = 'Amount') =>
  z
    .string()
    .trim()
    .refine(
      (v) => v === '' || isValidAmount(v),
      `${label} must be a positive amount with up to 2 decimals`,
    )

export const wholeNumberField = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d+$/.test(v), `${label} must be a whole number ≥ 0`)

export const skuField = z
  .string()
  .trim()
  .min(1, 'SKU is required')
  .max(64, 'SKU must be at most 64 characters')
  .regex(/^[A-Za-z0-9._\-/]+$/, 'Letters, numbers and . _ - / only')

export const passwordField = z
  .string()
  .min(8, 'Use at least 8 characters')
  .refine((v) => new TextEncoder().encode(v).length <= 72, 'Password is too long')

export const nameField = (label: string) =>
  z
    .string()
    .trim()
    .min(2, `${label} must be at least 2 characters`)
    .max(120, `${label} must be at most 120 characters`)

export const emailField = z.email('Enter a valid email address')
