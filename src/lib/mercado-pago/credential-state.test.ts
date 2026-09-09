import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MercadoPagoCredentialError,
  resolveMercadoPagoCredential,
  type MercadoPagoCredentialRow,
} from './credential-state.ts'

const NOW = Date.parse('2026-09-09T12:00:00.000Z')

function row(overrides: Partial<MercadoPagoCredentialRow> = {}): MercadoPagoCredentialRow {
  return {
    mp_access_token: 'private-token',
    mp_user_id: null,
    credential_source: 'manual',
    connection_status: 'connected',
    mp_token_expires_at: null,
    mp_live_mode: null,
    ...overrides,
  }
}

function expectCode(action: () => unknown, code: string) {
  assert.throws(action, error => (
    error instanceof MercadoPagoCredentialError && error.code === code
  ))
}

test('keeps a connected legacy manual credential usable without seller metadata', () => {
  assert.deepEqual(resolveMercadoPagoCredential(row(), NOW), {
    accessToken: 'private-token',
    source: 'manual',
    userId: null,
    liveMode: null,
  })
})

test('returns a connected OAuth credential outside the refresh margin', () => {
  const credential = resolveMercadoPagoCredential(row({
    credential_source: 'oauth',
    mp_user_id: '123456',
    mp_live_mode: false,
    mp_token_expires_at: '2026-09-09T13:00:01.000Z',
  }), NOW)

  assert.equal(credential.source, 'oauth')
  assert.equal(credential.userId, '123456')
})

test('requires refresh for an OAuth token inside the safety margin', () => {
  expectCode(() => resolveMercadoPagoCredential(row({
    credential_source: 'oauth',
    mp_user_id: '123456',
    mp_token_expires_at: '2026-09-09T12:09:59.000Z',
  }), NOW), 'MERCADO_PAGO_TOKEN_REFRESH_REQUIRED')
})

test('fails closed for disconnected and reauth-required credentials', () => {
  expectCode(() => resolveMercadoPagoCredential(row({
    connection_status: 'disconnected',
    mp_access_token: null,
  }), NOW), 'MERCADO_PAGO_NOT_CONNECTED')

  expectCode(() => resolveMercadoPagoCredential(row({
    connection_status: 'reauth_required',
    mp_access_token: null,
  }), NOW), 'MERCADO_PAGO_REAUTH_REQUIRED')
})
