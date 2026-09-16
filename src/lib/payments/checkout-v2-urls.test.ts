import assert from 'node:assert/strict'
import test from 'node:test'

import { buildCheckoutNotificationUrl, resolveCheckoutAppUrl } from './checkout-v2-urls.ts'

const shopId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const appUrl = 'https://turnea-preview.vercel.app'

test('public Preview without a bypass secret keeps an ordinary webhook URL', () => {
  const result = buildCheckoutNotificationUrl(appUrl, shopId, 'preview', undefined)
  assert.ok(result?.url)
  const url = new URL(result.url)
  assert.equal(url.origin, appUrl)
  assert.equal(url.pathname, '/api/webhooks/mp')
  assert.equal(url.searchParams.get('barbershop_id'), shopId)
  assert.equal(url.searchParams.get('source_news'), 'webhooks')
  assert.equal(url.searchParams.has('x-vercel-protection-bypass'), false)
})

test('protected Preview appends its configured bypass secret', () => {
  const result = buildCheckoutNotificationUrl(appUrl, shopId, 'preview', '  test-bypass  ')
  assert.ok(result?.url)
  assert.equal(new URL(result.url).searchParams.get('x-vercel-protection-bypass'), 'test-bypass')
})

test('Production ignores any bypass secret', () => {
  const result = buildCheckoutNotificationUrl('https://turnea.vercel.app', shopId, 'production', 'test-bypass')
  assert.ok(result?.url)
  assert.equal(new URL(result.url).searchParams.has('x-vercel-protection-bypass'), false)
})

test('malformed or unsafe public app URL fails closed', () => {
  assert.equal(resolveCheckoutAppUrl('not a url', appUrl, 'turnea-preview.vercel.app'), null)
  assert.equal(resolveCheckoutAppUrl('http://turnea-preview.vercel.app', appUrl, 'turnea-preview.vercel.app'), null)
  assert.equal(resolveCheckoutAppUrl(undefined, appUrl, 'turnea-preview.vercel.app'), null)
  assert.equal(buildCheckoutNotificationUrl('not a url', shopId, 'preview', undefined), null)
})

test('localhost keeps the existing no-webhook behavior', () => {
  const local = resolveCheckoutAppUrl(undefined, 'http://localhost:3000', 'localhost')
  assert.equal(local, 'http://localhost:3000')
  assert.deepEqual(buildCheckoutNotificationUrl(local, shopId, undefined, undefined), { url: null })
})
