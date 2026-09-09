import { effectiveRateFromPercentage } from './payments/processing-fee.ts'

export interface SettingsSnapshotInput {
  name: string
  slug: string
  description: string
  address: string
  phone: string
  instagram: string
  timezone: string
  slotDuration: number
  advanceBookingDays: number
  depositRequired: boolean
  depositPercentage: number
  processingFeeMode: string
  mpSettlementOption: string
  baseProcessingRatePercent: string
  newMpAccessToken: string
}

export interface SettingsSnapshot {
  name: string
  slug: string
  description: string
  address: string
  phone: string
  instagram: string
  timezone: string
  slotDuration: number
  advanceBookingDays: number
  depositRequired: boolean
  depositPercentage: number
  processingFeeMode: string
  mpSettlementOption: string
  baseProcessingRate: string
  hasNewMpAccessToken: boolean
}

function normalizePercentage(value: string) {
  const trimmedValue = value.trim()
  if (!trimmedValue) return ''

  try {
    return effectiveRateFromPercentage(trimmedValue)
  } catch {
    return `invalid:${trimmedValue}`
  }
}

export function createSettingsSnapshot(input: SettingsSnapshotInput): SettingsSnapshot {
  return {
    name: input.name.trim(),
    slug: input.slug.trim(),
    description: input.description.trim(),
    address: input.address.trim(),
    phone: input.phone.trim(),
    instagram: input.instagram.trim(),
    timezone: input.timezone,
    slotDuration: input.slotDuration,
    advanceBookingDays: input.advanceBookingDays,
    depositRequired: input.depositRequired,
    depositPercentage: input.depositPercentage,
    processingFeeMode: input.processingFeeMode,
    mpSettlementOption: input.mpSettlementOption,
    baseProcessingRate: normalizePercentage(input.baseProcessingRatePercent),
    hasNewMpAccessToken: Boolean(input.newMpAccessToken.trim()),
  }
}

export function settingsSnapshotsEqual(left: SettingsSnapshot, right: SettingsSnapshot) {
  return JSON.stringify(left) === JSON.stringify(right)
}
