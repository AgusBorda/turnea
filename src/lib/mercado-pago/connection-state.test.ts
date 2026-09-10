import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EMPTY_MERCADO_PAGO_CONNECTION_SUMMARY,
  getMercadoPagoConnectionUiState,
  getMercadoPagoOAuthResult,
  parseSettingsSection,
} from './connection-state.ts'

test('maps every safe connection summary to its Settings state', () => {
  assert.equal(getMercadoPagoConnectionUiState(EMPTY_MERCADO_PAGO_CONNECTION_SUMMARY), 'not_connected')
  assert.equal(getMercadoPagoConnectionUiState({
    ...EMPTY_MERCADO_PAGO_CONNECTION_SUMMARY,
    configured: true,
    source: 'manual',
    status: 'connected',
  }), 'manual_legacy')
  assert.equal(getMercadoPagoConnectionUiState({
    ...EMPTY_MERCADO_PAGO_CONNECTION_SUMMARY,
    configured: true,
    source: 'oauth',
    status: 'connected',
  }), 'oauth_connected')
  assert.equal(getMercadoPagoConnectionUiState({
    ...EMPTY_MERCADO_PAGO_CONNECTION_SUMMARY,
    source: 'oauth',
    status: 'reauth_required',
  }), 'reauth_required')
  assert.equal(getMercadoPagoConnectionUiState({
    ...EMPTY_MERCADO_PAGO_CONNECTION_SUMMARY,
    source: 'oauth',
    status: 'disconnected',
  }), 'not_connected')
})

test('accepts only known Settings tabs', () => {
  assert.equal(parseSettingsSection('mercado-pago'), 'mercado-pago')
  assert.equal(parseSettingsSection('reservations'), 'reservations')
  assert.equal(parseSettingsSection('unexpected'), 'general')
  assert.equal(parseSettingsSection(undefined), 'general')
})

test('maps callback results to safe Spanish messages', () => {
  assert.deepEqual(getMercadoPagoOAuthResult('connected', null), {
    tone: 'success',
    message: 'Mercado Pago se conectó correctamente.',
  })
  assert.equal(getMercadoPagoOAuthResult('oauth_error', 'invalid_state')?.message.includes('válida'), true)
  assert.equal(getMercadoPagoOAuthResult('oauth_error', 'raw-provider-error')?.message.includes('raw-provider-error'), false)
  assert.equal(getMercadoPagoOAuthResult(null, null), null)
})
