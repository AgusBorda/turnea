import { createHmac, timingSafeEqual } from 'node:crypto'

function parseMoneyCents(value: unknown): bigint | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) return null

  const normalized = String(value).trim()
  const match = normalized.match(/^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/)
  if (!match) return null

  const fraction = (match[2] ?? '').padEnd(2, '0')
  return BigInt(match[1]) * BigInt(100) + BigInt(fraction || '0')
}

export function paymentAmountAndCurrencyMatch(input: {
  expectedAmount: unknown
  expectedCurrency: unknown
  paidAmount: unknown
  paidCurrency: unknown
}): boolean {
  const expectedCents = parseMoneyCents(input.expectedAmount)
  const paidCents = parseMoneyCents(input.paidAmount)
  const expectedCurrency = typeof input.expectedCurrency === 'string'
    ? input.expectedCurrency.trim().toUpperCase()
    : ''
  const paidCurrency = typeof input.paidCurrency === 'string'
    ? input.paidCurrency.trim().toUpperCase()
    : ''

  return expectedCents !== null
    && paidCents !== null
    && expectedCents === paidCents
    && /^[A-Z]{3}$/.test(expectedCurrency)
    && paidCurrency === expectedCurrency
}

export function moneyAmountAsNumber(value: unknown): number | null {
  const cents = parseMoneyCents(value)
  if (cents === null || cents > BigInt(Number.MAX_SAFE_INTEGER)) return null
  return Number(cents) / 100
}

export function validateMercadoPagoWebhookSignature(input: {
  xSignature: string | null
  requestId: string | null
  dataId: string | null
  secret: string
}): boolean {
  let timestamp = ''
  let receivedHash = ''

  for (const part of input.xSignature?.split(',') || []) {
    const separatorIndex = part.indexOf('=')
    if (separatorIndex === -1) continue

    const key = part.slice(0, separatorIndex).trim()
    const value = part.slice(separatorIndex + 1).trim()

    if (key === 'ts') timestamp = value
    if (key === 'v1') receivedHash = value.toLowerCase()
  }

  const dataId = input.dataId?.toLowerCase() || ''
  const requestId = input.requestId || ''
  const manifest = [
    dataId ? `id:${dataId};` : '',
    requestId ? `request-id:${requestId};` : '',
    timestamp ? `ts:${timestamp};` : '',
  ].join('')

  if (!/^[0-9a-f]{64}$/.test(receivedHash)) return false

  const expectedHash = createHmac('sha256', input.secret).update(manifest).digest()
  const receivedHashBuffer = Buffer.from(receivedHash, 'hex')
  return receivedHashBuffer.length === expectedHash.length
    && timingSafeEqual(receivedHashBuffer, expectedHash)
}