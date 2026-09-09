import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSettingsSnapshot,
  settingsSnapshotsEqual,
  type SettingsSnapshotInput,
} from './settings-dirty-state.ts'

const INITIAL_VALUES: SettingsSnapshotInput = {
  name: 'Turnea Barber',
  slug: 'turnea-barber',
  description: '',
  address: '',
  phone: '',
  instagram: '',
  timezone: 'America/Argentina/Buenos_Aires',
  slotDuration: 30,
  advanceBookingDays: 30,
  depositRequired: true,
  depositPercentage: 50,
  processingFeeMode: 'customer_covers',
  mpSettlementOption: 'instant',
  baseProcessingRatePercent: '6.60',
  newMpAccessToken: '',
}

function isDirty(values: SettingsSnapshotInput) {
  return !settingsSnapshotsEqual(
    createSettingsSnapshot(INITIAL_VALUES),
    createSettingsSnapshot(values)
  )
}

test('starts clean and returns to clean when a changed value is restored', () => {
  assert.equal(isDirty(INITIAL_VALUES), false)
  assert.equal(isDirty({ ...INITIAL_VALUES, name: 'Otro nombre' }), true)
  assert.equal(isDirty({ ...INITIAL_VALUES, name: INITIAL_VALUES.name }), false)
})

test('detects reservation and credential changes', () => {
  assert.equal(isDirty({ ...INITIAL_VALUES, timezone: 'America/Montevideo' }), true)
  assert.equal(isDirty({ ...INITIAL_VALUES, depositPercentage: 40 }), true)
  assert.equal(isDirty({ ...INITIAL_VALUES, newMpAccessToken: 'TEST-private' }), true)
})

test('normalizes persisted strings and equivalent percentage formats', () => {
  assert.equal(isDirty({ ...INITIAL_VALUES, name: ` ${INITIAL_VALUES.name} ` }), false)
  assert.equal(isDirty({ ...INITIAL_VALUES, baseProcessingRatePercent: '6,6' }), false)
  assert.equal(isDirty({ ...INITIAL_VALUES, newMpAccessToken: '   ' }), false)
})

test('visual tab state is outside the persisted snapshot', () => {
  const snapshot = createSettingsSnapshot(INITIAL_VALUES)
  assert.equal('activeSection' in snapshot, false)
})

test('a successful save baseline makes the new values clean', () => {
  const changedValues = {
    ...INITIAL_VALUES,
    name: 'Nombre guardado',
    newMpAccessToken: 'TEST-private',
  }
  const valuesAfterSave = { ...changedValues, newMpAccessToken: '' }
  const savedBaseline = createSettingsSnapshot(valuesAfterSave)

  assert.equal(settingsSnapshotsEqual(savedBaseline, createSettingsSnapshot(valuesAfterSave)), true)
})
