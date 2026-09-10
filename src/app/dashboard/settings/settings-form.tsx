'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Building2, CalendarDays, Check, CreditCard, ExternalLink, Link2, ShieldCheck, Unlink, X } from 'lucide-react'
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import Button from '@/components/ui/button'
import Card from '@/components/ui/card'
import { inputClassName } from '@/components/ui/input-styles'
import TurneaSelect from '@/components/ui/select'
import { ToastViewport, useToast } from '@/components/ui/toast'
import type { MercadoPagoSettlementOption, ProcessingFeeMode } from '@/lib/types'
import { createSettingsSnapshot, settingsSnapshotsEqual } from '@/lib/settings-dirty-state'
import {
  getMercadoPagoConnectionUiState,
  shouldWarnDepositCapability,
  type MercadoPagoConnectionSummary,
  type MercadoPagoOAuthResult,
  type SettingsSection,
} from '@/lib/mercado-pago/connection-state'
import {
  calculateEffectiveProcessingRate,
  calculateProcessingFee,
  effectiveRateFromPercentage,
  rateFractionToPercentage,
} from '@/lib/payments/processing-fee'

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires'
const TIMEZONE_OPTIONS = [
  { value: DEFAULT_TIMEZONE, label: 'Buenos Aires (Argentina)' },
  { value: 'America/Montevideo', label: 'Montevideo (Uruguay)' },
  { value: 'America/Santiago', label: 'Santiago (Chile)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (Brasil)' },
  { value: 'Europe/Madrid', label: 'Madrid (España)' },
  { value: 'America/Mexico_City', label: 'Ciudad de México (México)' },
] as const

interface SettingsBarbershop {
  id: string
  name: string
  slug: string
  description: string | null
  address: string | null
  phone: string | null
  instagram: string | null
  timezone: string
  slot_duration: number
  deposit_required: boolean
  deposit_percentage: number
  advance_booking_days: number
  mp_configured: boolean
  processing_fee_mode: ProcessingFeeMode
  mp_settlement_option: MercadoPagoSettlementOption
  mp_base_processing_rate: number | null
  processing_fee_vat_rate: number
  effective_processing_rate: number
}

interface ProcessingRatePreset {
  settlement_option: MercadoPagoSettlementOption
  label: string
  suggested_base_rate: number | null
}

interface Props {
  barbershop: SettingsBarbershop | null
  processingRatePresets: ProcessingRatePreset[]
  userId: string
  initialSection: SettingsSection
  initialOAuthResult: MercadoPagoOAuthResult
  initialConnectionSummary: MercadoPagoConnectionSummary
}

const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General', icon: Building2 },
  { id: 'reservations', label: 'Reservas', icon: CalendarDays },
  { id: 'mercado-pago', label: 'Mercado Pago', icon: CreditCard },
] as const

const ADVANCE_BOOKING_OPTIONS = [
  { id: '7', label: '1 semana' },
  { id: '14', label: '2 semanas' },
  { id: '21', label: '3 semanas' },
  { id: '30', label: '1 mes' },
  { id: '60', label: '2 meses' },
  { id: '90', label: '3 meses' },
]

export default function SettingsForm({
  barbershop,
  processingRatePresets,
  userId,
  initialSection,
  initialOAuthResult,
  initialConnectionSummary,
}: Props) {
  const [name, setName] = useState(barbershop?.name || '')
  const [slug, setSlug] = useState(barbershop?.slug || '')
  const [description, setDescription] = useState(barbershop?.description || '')
  const [address, setAddress] = useState(barbershop?.address || '')
  const [phone, setPhone] = useState(barbershop?.phone || '')
  const [instagram, setInstagram] = useState(barbershop?.instagram || '')
  const [timezone, setTimezone] = useState(barbershop?.timezone || DEFAULT_TIMEZONE)
  const [persistedTimezone, setPersistedTimezone] = useState(
    barbershop?.timezone || DEFAULT_TIMEZONE
  )
  const [slotDuration, setSlotDuration] = useState(barbershop?.slot_duration || 30)
  const [depositRequired, setDepositRequired] = useState(barbershop?.deposit_required || false)
  const [depositPercentage, setDepositPercentage] = useState(barbershop?.deposit_percentage || 50)
  const [mpConfigured, setMpConfigured] = useState(barbershop?.mp_configured || false)
  const [processingFeeMode, setProcessingFeeMode] = useState<ProcessingFeeMode>(
    barbershop?.processing_fee_mode || 'barbershop_absorbs'
  )
  const [mpSettlementOption, setMpSettlementOption] = useState<MercadoPagoSettlementOption>(
    barbershop?.mp_settlement_option || 'custom'
  )
  const [baseProcessingRatePercent, setBaseProcessingRatePercent] = useState(
    barbershop?.mp_base_processing_rate == null
      ? ''
      : rateFractionToPercentage(String(barbershop.mp_base_processing_rate))
  )
  const [newMpAccessToken, setNewMpAccessToken] = useState('')
  const [advanceBookingDays, setAdvanceBookingDays] = useState(barbershop?.advance_booking_days || 30)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection)
  const [connectionSummary, setConnectionSummary] = useState(initialConnectionSummary)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [oauthActionError, setOauthActionError] = useState('')
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [persistedSnapshot, setPersistedSnapshot] = useState(() => createSettingsSnapshot({
    name,
    slug,
    description,
    address,
    phone,
    instagram,
    timezone,
    slotDuration,
    advanceBookingDays,
    depositRequired,
    depositPercentage,
    processingFeeMode,
    mpSettlementOption,
    baseProcessingRatePercent,
    newMpAccessToken: '',
  }))
  const router = useRouter()
  const { toasts, showToast, dismissToast } = useToast()
  const currentSnapshot = createSettingsSnapshot({
    name,
    slug,
    description,
    address,
    phone,
    instagram,
    timezone,
    slotDuration,
    advanceBookingDays,
    depositRequired,
    depositPercentage,
    processingFeeMode,
    mpSettlementOption,
    baseProcessingRatePercent,
    newMpAccessToken,
  })
  const isDirty = !settingsSnapshotsEqual(currentSnapshot, persistedSnapshot)
  const connectionUiState = getMercadoPagoConnectionUiState(connectionSummary)
  const showDepositCapabilityWarning = shouldWarnDepositCapability(depositRequired, connectionSummary)

  useEffect(() => {
    if (!initialOAuthResult) return
    showToast(initialOAuthResult)
    router.replace('/dashboard/settings?tab=mercado-pago', { scroll: false })
  }, [initialOAuthResult, router, showToast])
  const timezoneSelectOptions = [
    ...(!TIMEZONE_OPTIONS.some(option => option.value === timezone)
      ? [{ id: timezone, label: `${timezone} (actual)` }]
      : []),
    ...TIMEZONE_OPTIONS.map(option => ({ id: option.value, label: option.label })),
  ]
  const selectedProcessingRatePreset = processingRatePresets.find(
    preset => preset.settlement_option === mpSettlementOption
  )
  const vatRate = String(barbershop?.processing_fee_vat_rate ?? 0.21)
  const vatRatePercent = (Number(vatRate) * 100).toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  const hasLegacyEffectiveOnlyRate = Boolean(
    barbershop
    && barbershop.mp_base_processing_rate == null
    && Number(barbershop.effective_processing_rate) > 0
  )
  let effectiveProcessingRate = hasLegacyEffectiveOnlyRate
    ? String(barbershop?.effective_processing_rate ?? 0)
    : '0.000000'
  let processingFeePreview: ReturnType<typeof calculateProcessingFee> | null = null

  try {
    if (baseProcessingRatePercent.trim()) {
      effectiveProcessingRate = calculateEffectiveProcessingRate(
        effectiveRateFromPercentage(baseProcessingRatePercent),
        vatRate
      )
    }
    processingFeePreview = calculateProcessingFee({
      depositAmount: '1500.00',
      processingFeeMode,
      effectiveRate: effectiveProcessingRate,
      currency: 'ARS',
    })
  } catch {
    processingFeePreview = null
  }

  const formatPreviewAmount = (amount: string) => new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount))

  function formatBaseRateInput() {
    if (!baseProcessingRatePercent.trim()) return

    try {
      const normalizedRate = effectiveRateFromPercentage(baseProcessingRatePercent)
      setBaseProcessingRatePercent(rateFractionToPercentage(normalizedRate).replace('.', ','))
    } catch {
      // Validation remains visible on submit and in the calculation preview.
    }
  }

  function generateSlug(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  function handleNameChange(value: string) {
    setName(value)
    if (!barbershop) {
      setSlug(generateSlug(value))
    }
  }

  async function saveMercadoPagoCredential(barbershopId: string, accessToken: string) {
    const response = await fetch('/api/settings/mercado-pago', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barbershopId, accessToken }),
    })
    const result: { error?: string } = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'No se pudo guardar la credencial de Mercado Pago.')
    }
  }

  function markManualCredentialConnected() {
    setMpConfigured(true)
    setConnectionSummary({
      configured: true,
      source: 'manual',
      status: 'connected',
      mpUserId: null,
      expiresAt: null,
      connectedAt: null,
    })
  }

  async function handleConnectMercadoPago() {
    if (!barbershop || oauthLoading) return
    if (isDirty) {
      setOauthActionError('Tenés cambios sin guardar. Guardalos o descartalos antes de conectar Mercado Pago.')
      return
    }

    setOauthLoading(true)
    setOauthActionError('')
    try {
      const response = await fetch('/api/mercado-pago/oauth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barbershopId: barbershop.id }),
      })
      const result = await response.json() as { authorizationUrl?: unknown; error?: unknown }
      if (!response.ok || typeof result.authorizationUrl !== 'string') {
        throw new Error(typeof result.error === 'string' ? result.error : 'No se pudo iniciar la conexión.')
      }

      const authorizationUrl = new URL(result.authorizationUrl)
      if (authorizationUrl.origin !== 'https://auth.mercadopago.com') {
        throw new Error('La dirección de autorización recibida no es válida.')
      }
      window.location.assign(authorizationUrl.toString())
    } catch (connectError) {
      setOauthActionError(
        connectError instanceof Error
          ? connectError.message
          : 'No se pudo iniciar la conexión con Mercado Pago.'
      )
      setOauthLoading(false)
    }
  }

  async function handleDisconnectMercadoPago() {
    if (!barbershop || disconnecting) return
    setDisconnecting(true)
    setOauthActionError('')
    try {
      const response = await fetch('/api/mercado-pago/oauth/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barbershopId: barbershop.id }),
      })
      const result = await response.json() as { error?: unknown }
      if (!response.ok) {
        throw new Error(typeof result.error === 'string' ? result.error : 'No se pudo desconectar Mercado Pago.')
      }

      setConnectionSummary(current => ({
        ...current,
        configured: false,
        status: 'disconnected',
        expiresAt: null,
      }))
      setMpConfigured(false)
      setDisconnectDialogOpen(false)
      showToast({ message: 'Mercado Pago se desconectó correctamente.', tone: 'success' })
      router.refresh()
    } catch (disconnectError) {
      setOauthActionError(
        disconnectError instanceof Error
          ? disconnectError.message
          : 'No se pudo desconectar Mercado Pago.'
      )
    } finally {
      setDisconnecting(false)
    }
  }

  function markCurrentSettingsPersisted() {
    setPersistedSnapshot({
      ...currentSnapshot,
      hasNewMpAccessToken: false,
    })
    setNewMpAccessToken('')
    setSaved(true)
    router.refresh()
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) return

    let baseProcessingRate: string | null = null
    try {
      if (baseProcessingRatePercent.trim()) {
        baseProcessingRate = effectiveRateFromPercentage(baseProcessingRatePercent)
        calculateEffectiveProcessingRate(baseProcessingRate, vatRate)
      } else if (!hasLegacyEffectiveOnlyRate) {
        baseProcessingRate = '0.000000'
      }
    } catch {
      setError('La tasa base y su costo efectivo deben estar entre 0% y 15%.')
      return
    }

    setLoading(true)
    setError('')
    setSaved(false)

    const supabase = createClient()
    const data = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
      address: address.trim() || null,
      phone: phone.trim() || null,
      instagram: instagram.trim() || null,
      timezone,
      slot_duration: slotDuration,
      deposit_required: depositRequired,
      deposit_percentage: depositPercentage,
      advance_booking_days: advanceBookingDays,
      processing_fee_mode: processingFeeMode,
      mp_settlement_option: mpSettlementOption,
      ...(baseProcessingRate !== null && {
        mp_base_processing_rate: baseProcessingRate,
      }),
    }
    const accessToken = newMpAccessToken.trim()

    if (barbershop) {
      const { error: err } = await supabase
        .from('barbershops')
        .update(data)
        .eq('id', barbershop.id)

      if (err) {
        setTimezone(persistedTimezone)
        setError(
          err.message.includes('INVALID_BARBERSHOP_TIMEZONE')
            ? 'La zona horaria seleccionada no es válida.'
            : err.message.includes('unique')
              ? 'Ese slug ya está en uso.'
              : err.message
        )
      } else {
        setPersistedTimezone(timezone)
        try {
          if (accessToken) {
            await saveMercadoPagoCredential(barbershop.id, accessToken)
            markManualCredentialConnected()
          }
          markCurrentSettingsPersisted()
        } catch (credentialError) {
          setError(credentialError instanceof Error ? credentialError.message : 'No se pudo guardar la credencial de Mercado Pago.')
        }
      }
    } else {
      const { data: createdBarbershop, error: err } = await supabase
        .from('barbershops')
        .insert({ ...data, owner_id: userId })
        .select('id')
        .single()

      if (err) {
        setError(
          err.message.includes('INVALID_BARBERSHOP_TIMEZONE')
            ? 'La zona horaria seleccionada no es válida.'
            : err.message.includes('unique')
              ? 'Ese slug ya está en uso.'
              : err.message
        )
      } else {
        try {
          if (accessToken) {
            await saveMercadoPagoCredential(createdBarbershop.id, accessToken)
            markManualCredentialConnected()
          }
          markCurrentSettingsPersisted()
        } catch (credentialError) {
          setError(credentialError instanceof Error ? credentialError.message : 'La barbería se creó, pero no se pudo guardar la credencial de Mercado Pago.')
          router.refresh()
        }
      }
    }

    setLoading(false)
  }

  function handleSectionKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index

    if (event.key === 'ArrowRight') nextIndex = (index + 1) % SETTINGS_SECTIONS.length
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = SETTINGS_SECTIONS.length - 1
    else return

    event.preventDefault()
    const nextSection = SETTINGS_SECTIONS[nextIndex]
    setActiveSection(nextSection.id)
    document.getElementById(`settings-tab-${nextSection.id}`)?.focus()
  }

  return (
    <form onSubmit={handleSave} autoComplete="off" className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-col gap-4 pb-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Configuración</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)] sm:text-base">
            Administrá los datos, reservas y cobros de tu barbería.
          </p>
        </div>
        <Button
          type="submit"
          disabled={loading || !isDirty || !name.trim() || !slug.trim()}
          className="w-full shrink-0 sm:w-auto"
        >
          {loading ? 'Guardando...' : barbershop ? 'Guardar cambios' : 'Crear barbería'}
        </Button>
      </header>

      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3">{error}</div>}
      {saved && !isDirty && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          <Check className="h-4 w-4" aria-hidden="true" />
          ¡Guardado!
        </div>
      )}

      <div className="space-y-5">
        <nav
          aria-label="Secciones de configuración"
          role="tablist"
          className="grid grid-cols-3 border-b border-[var(--border)]"
        >
          {SETTINGS_SECTIONS.map((section, index) => {
            const Icon = section.icon
            const selected = activeSection === section.id
            return (
              <button
                key={section.id}
                id={`settings-tab-${section.id}`}
                type="button"
                onClick={() => setActiveSection(section.id)}
                onKeyDown={event => handleSectionKeyDown(event, index)}
                role="tab"
                aria-selected={selected}
                aria-controls={`settings-panel-${section.id}`}
                tabIndex={selected ? 0 : -1}
                className={`-mb-px flex min-h-11 min-w-0 items-center justify-center gap-1.5 border-b-2 px-1.5 py-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)] sm:gap-2 sm:px-4 sm:text-sm ${
                  selected
                    ? 'border-[var(--primary)] text-[var(--primary)]'
                    : 'border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:text-[var(--foreground)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
                <span className="truncate">{section.label}</span>
              </button>
            )
          })}
        </nav>

        <div
          id={`settings-panel-${activeSection}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeSection}`}
          className="min-w-0"
        >
          {activeSection === 'general' && (
            <Card className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold">Información de la barbería</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Estos datos identifican tu negocio en Turnea.</p>
              </div>

        <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="settings-name" className="mb-1.5 block text-sm font-medium">Nombre *</label>
          <input
            id="settings-name"
            type="text"
            value={name}
            onChange={e => handleNameChange(e.target.value)}
            required
            className={`${inputClassName} w-full`}
            placeholder="Ej: Barbería El Tano"
          />
        </div>

        <div>
          <label htmlFor="settings-slug" className="mb-1.5 block text-sm font-medium">Slug (URL) *</label>
          <div className="flex min-w-0 items-center rounded-lg border border-[var(--border)] bg-white focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--primary)]/20">
            <span className="shrink-0 pl-3 text-sm text-[var(--muted)]">turnea.app/</span>
            <input
              id="settings-slug"
              type="text"
              value={slug}
              onChange={e => setSlug(generateSlug(e.target.value))}
              required
              className="turnea-input min-h-11 min-w-0 flex-1 rounded-r-lg bg-transparent px-1 py-2.5 pr-3 text-sm font-medium focus:outline-none"
              placeholder="barberia-el-tano"
            />
          </div>
          {barbershop && (
            <a
              href={`/${barbershop.slug}`}
              target="_blank"
              className="inline-flex items-center gap-1 mt-1 text-xs text-[var(--primary)] hover:underline"
            >
              Ver página pública <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        </div>

        <div>
          <label htmlFor="settings-description" className="mb-1.5 block text-sm font-medium">Descripción</label>
          <textarea
            id="settings-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className={`${inputClassName} min-h-24 w-full resize-y`}
            placeholder="Breve descripción de tu barbería"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="settings-address" className="mb-1.5 block text-sm font-medium">Dirección</label>
            <input
              id="settings-address"
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              className={`${inputClassName} w-full`}
              placeholder="Calle 123, Ciudad"
            />
          </div>
          <div>
            <label htmlFor="settings-phone" className="mb-1.5 block text-sm font-medium">Teléfono</label>
            <input
              id="settings-phone"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className={`${inputClassName} w-full`}
              placeholder="1155667788"
            />
          </div>
        </div>

        <div>
          <label htmlFor="settings-instagram" className="mb-1.5 block text-sm font-medium">Instagram (sin @)</label>
          <input
            id="settings-instagram"
            type="text"
            value={instagram}
            onChange={e => setInstagram(e.target.value)}
            className={`${inputClassName} w-full`}
            placeholder="barberia_eltano"
          />
        </div>
            </Card>
          )}

          {activeSection === 'reservations' && (
            <Card className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold">Configuración de reservas</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Definí cómo y con cuánta anticipación pueden reservar tus clientes.</p>
              </div>

        <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="timezone">
            Zona horaria
          </label>
          <TurneaSelect
            id="timezone"
            value={timezone}
            onChange={setTimezone}
            options={timezoneSelectOptions}
            ariaLabel="Zona horaria"
          />
          <p className="text-xs text-[var(--muted)] mt-1">
            Se usa para calcular el día y los horarios disponibles de la barbería.
          </p>
        </div>

        <div>
          <label htmlFor="slot-duration" className="mb-1.5 block text-sm font-medium">Duración del slot (minutos)</label>
          <input
            id="slot-duration"
            type="number"
            value={slotDuration}
            onChange={e => setSlotDuration(Number(e.target.value))}
            min={15}
            step={5}
            className={`${inputClassName} w-full`}
          />
          <p className="text-xs text-[var(--muted)] mt-1">Intervalo entre turnos disponibles.</p>
        </div>
        <div>
          <label htmlFor="advance-booking-days" className="mb-1.5 block text-sm font-medium">Días disponibles para reservar</label>
          <TurneaSelect
            id="advance-booking-days"
            value={String(advanceBookingDays)}
            onChange={value => setAdvanceBookingDays(Number(value))}
            options={ADVANCE_BOOKING_OPTIONS}
            ariaLabel="Días disponibles para reservar"
          />
          <p className="mt-1 text-xs text-[var(--muted)]">Hasta cuántos días hacia adelante pueden reservar tus clientes.</p>
        </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/35 p-4">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="deposit"
            checked={depositRequired}
            onChange={e => setDepositRequired(e.target.checked)}
            className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
          />
          <label htmlFor="deposit" className="text-sm font-medium">Requerir seña al reservar</label>
        </div>

        <div className={`mt-4 border-t border-[var(--border)] pt-4 ${depositRequired ? '' : 'opacity-50'}`}>
            <label htmlFor="deposit-percentage" className="mb-1.5 block text-sm font-medium">Porcentaje de seña (%)</label>
            <input
              id="deposit-percentage"
              type="number"
              value={depositPercentage}
              onChange={e => setDepositPercentage(Number(e.target.value))}
              min={10}
              max={100}
              disabled={!depositRequired}
              className={`${inputClassName} w-full sm:max-w-xs`}
            />
            {!depositRequired && <p className="mt-1 text-xs text-[var(--muted)]">Activá la seña para configurar el porcentaje.</p>}
        </div>
        {showDepositCapabilityWarning && (
          <div role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              <div>
                <p className="text-amber-950">
                  Tenés activadas las señas, pero Mercado Pago no está conectado. Tus clientes no podrán completar reservas con seña hasta que lo conectes.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveSection('mercado-pago')
                    router.replace('/dashboard/settings?tab=mercado-pago', { scroll: false })
                  }}
                  className="mt-2 font-medium text-[var(--primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
                >
                  Conectar Mercado Pago
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
            </Card>
          )}

          {activeSection === 'mercado-pago' && (
      <Card className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Mercado Pago</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Conectá tu cuenta para cobrar señas automáticamente.
          </p>
        </div>

        <section className={`rounded-xl border p-4 sm:p-5 ${
          connectionUiState === 'oauth_connected'
            ? 'border-green-200 bg-green-50/70'
            : connectionUiState === 'reauth_required'
              ? 'border-amber-200 bg-amber-50/70'
              : 'border-[var(--border)] bg-[var(--secondary)]/35'
        }`}>
          <div className="flex items-start gap-3">
            {connectionUiState === 'reauth_required' ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            ) : connectionUiState === 'oauth_connected' ? (
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-700" aria-hidden="true" />
            ) : (
              <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--muted)]" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">
                {connectionUiState === 'oauth_connected' && 'Mercado Pago conectado'}
                {connectionUiState === 'manual_legacy' && 'Mercado Pago configurado manualmente'}
                {connectionUiState === 'reauth_required' && 'Necesitamos volver a conectar Mercado Pago'}
                {connectionUiState === 'not_connected' && 'Conectá Mercado Pago'}
              </h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {connectionUiState === 'oauth_connected' && 'Tu cuenta está vinculada correctamente.'}
                {connectionUiState === 'manual_legacy' && 'Esta barbería usa una credencial manual. Podés migrarla a una conexión automática.'}
                {connectionUiState === 'reauth_required' && 'La conexión actual no puede usarse para nuevos cobros hasta que vuelvas a autorizarla.'}
                {connectionUiState === 'not_connected' && 'Conectá tu cuenta para recibir señas automáticamente.'}
              </p>
              {connectionUiState === 'oauth_connected' && (
                <dl className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                  {connectionSummary.mpUserId && (
                    <div className="flex flex-wrap gap-x-2">
                      <dt>Cuenta vendedora</dt>
                      <dd className="font-medium text-[var(--foreground)]">{connectionSummary.mpUserId}</dd>
                    </div>
                  )}
                  {connectionSummary.connectedAt && (
                    <div className="flex flex-wrap gap-x-2">
                      <dt>Conectada</dt>
                      <dd className="font-medium text-[var(--foreground)]">
                        {new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(connectionSummary.connectedAt))}
                      </dd>
                    </div>
                  )}
                </dl>
              )}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                {connectionUiState === 'oauth_connected' ? (
                  <Button type="button" variant="secondary" onClick={() => setDisconnectDialogOpen(true)}>
                    <Unlink className="h-4 w-4" aria-hidden="true" />
                    Desconectar
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => void handleConnectMercadoPago()}
                    disabled={!barbershop || oauthLoading}
                  >
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                    {oauthLoading
                      ? 'Conectando…'
                      : connectionUiState === 'reauth_required'
                        ? 'Reconectar Mercado Pago'
                        : 'Conectar Mercado Pago'}
                  </Button>
                )}
              </div>
              {oauthActionError && (
                <p role="alert" className="mt-3 text-sm text-red-700">{oauthActionError}</p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-[var(--border)] p-4 sm:p-5">
          <div>
            <h3 className="font-semibold">Plazo de acreditación</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">Elegí cuándo querés recibir tus señas.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {processingRatePresets.map(preset => {
                const selected = preset.settlement_option === mpSettlementOption
                return (
                  <button
                    key={preset.settlement_option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setMpSettlementOption(preset.settlement_option)
                      if (preset.suggested_base_rate != null) {
                        setBaseProcessingRatePercent(
                          rateFractionToPercentage(String(preset.suggested_base_rate)).replace('.', ',')
                        )
                      }
                    }}
                    className={`min-h-16 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 ${
                      selected
                        ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                        : 'border-[var(--border)] hover:border-[var(--primary)]/50'
                    }`}
                  >
                    <span className="block text-sm font-medium">{preset.label}</span>
                    <span className="block text-xs text-[var(--muted)] mt-0.5">
                      {preset.suggested_base_rate == null
                        ? 'Porcentaje definido manualmente'
                        : `Tasa base sugerida: ${rateFractionToPercentage(String(preset.suggested_base_rate)).replace('.', ',')}%`}
                    </span>
                  </button>
                )
              })}
            </div>
            {selectedProcessingRatePreset?.suggested_base_rate == null && (
              <p className="mt-2 text-xs text-amber-700">
                Este plazo no tiene una tasa sugerida. Verificá e ingresá la tasa base que muestra tu cuenta.
              </p>
            )}
          </div>
        </section>

        <section className="space-y-5 rounded-xl border border-[var(--border)] p-4 sm:p-5">
          <div>
            <h3 className="font-semibold">Costo de procesamiento</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">Configurá la tasa informada por Mercado Pago y quién absorbe ese costo.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="mp-base-processing-rate">
              Tasa que te muestra Mercado Pago
            </label>
            <div className="relative">
              <input
                id="mp-base-processing-rate"
                name="mp-base-processing-rate"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={baseProcessingRatePercent}
                onChange={event => setBaseProcessingRatePercent(event.target.value)}
                onBlur={formatBaseRateInput}
                placeholder={hasLegacyEffectiveOnlyRate ? 'Ingresá la tasa base para actualizar' : '6,60'}
                className={`${inputClassName} w-full pr-9`}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[var(--muted)]">
                %
              </span>
            </div>
            <p className="text-xs text-[var(--muted)] mt-1">
              Podés usar coma o punto decimal. Ejemplo: 6,60%.
            </p>
            <dl className="mt-3 space-y-1.5 rounded-lg bg-[var(--secondary)]/45 px-3 py-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">IVA sobre el costo</dt>
                <dd>{vatRatePercent}%</dd>
              </div>
              <div className="flex justify-between gap-4 font-medium">
                <dt>Costo efectivo estimado</dt>
                <dd>{(Number(effectiveProcessingRate) * 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}%</dd>
              </div>
            </dl>
            {hasLegacyEffectiveOnlyRate && !baseProcessingRatePercent.trim() && (
              <p className="mt-2 text-xs text-amber-700">
                Se conserva tu costo efectivo anterior de {(Number(barbershop?.effective_processing_rate ?? 0) * 100).toLocaleString('es-AR')}% hasta que ingreses una tasa base.
              </p>
            )}
            <p className="mt-2 text-xs text-[var(--muted)]">
              Turnea usa el costo efectivo estimado para calcular el Costo de procesamiento. Mercado Pago puede aplicar cargos adicionales según provincia, medio de pago u otras condiciones.
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">¿Quién absorbe el costo de procesamiento?</legend>
            <label className="flex items-start gap-3 rounded-lg border border-[var(--border)] p-3">
              <input
                type="radio"
                name="processing-fee-mode"
                value="barbershop_absorbs"
                checked={processingFeeMode === 'barbershop_absorbs'}
                onChange={() => setProcessingFeeMode('barbershop_absorbs')}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium">Mi barbería</span>
                <span className="block text-xs text-[var(--muted)]">El cliente paga solamente la seña.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-[var(--border)] p-3">
              <input
                type="radio"
                name="processing-fee-mode"
                value="customer_covers"
                checked={processingFeeMode === 'customer_covers'}
                onChange={() => setProcessingFeeMode('customer_covers')}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium">El cliente</span>
                <span className="block text-xs text-[var(--muted)]">
                  Se agrega un costo de procesamiento para compensar aproximadamente los cargos de Mercado Pago.
                </span>
              </span>
            </label>
          </fieldset>
        </section>

          <section className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/[0.035] p-4 sm:p-5">
            <p className="text-sm font-semibold">Resumen financiero</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">Para una seña hipotética de $1.500,00</p>
            {processingFeePreview ? (
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--muted)]">Seña</span>
                  <span>{formatPreviewAmount(processingFeePreview.depositAmount)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--muted)]">Costo de procesamiento</span>
                  <span>{formatPreviewAmount(processingFeePreview.processingFeeAmount)}</span>
                </div>
                <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-2 font-semibold">
                  <span>Total que pagaría el cliente</span>
                  <span>{formatPreviewAmount(processingFeePreview.paymentTotalAmount)}</span>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-red-600">
                Ingresá un porcentaje válido para calcular la vista previa.
              </p>
            )}
            <p className="mt-3 text-xs text-[var(--muted)]">
              Esta estimación no reemplaza las condiciones informadas por Mercado Pago.
            </p>
          </section>

        <details className="group rounded-xl border border-[var(--border)] p-4 sm:p-5">
          <summary className="cursor-pointer text-sm font-semibold marker:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2">
            Configuración manual avanzada
          </summary>
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <p className="mb-3 text-xs text-[var(--muted)]">
              Usá esta opción sólo si no podés conectar Mercado Pago automáticamente. Guardar un token manual reemplazará una conexión OAuth activa.
            </p>
            <label className="mb-1 block text-sm font-medium" htmlFor="mp-access-token">
              {mpConfigured ? 'Nuevo Access Token (opcional)' : 'Access Token'}
            </label>
            <input
              id="mp-access-token"
              name="mp-access-token"
              type="password"
              value={newMpAccessToken}
              onChange={e => setNewMpAccessToken(e.target.value)}
              className={`${inputClassName} w-full font-mono`}
              placeholder={mpConfigured ? 'Dejar vacío para conservar la credencial actual' : 'APP_USR-xxxx... o TEST-xxxx...'}
              autoComplete="new-password"
            />
            <p className="mt-1 text-xs text-[var(--muted)]">
              Encontralo en{' '}
              <a
                href="https://www.mercadopago.com.ar/settings/account/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--primary)] hover:underline"
              >
                mercadopago.com.ar → Credenciales
              </a>
              {' '}→ &quot;Credenciales de producción&quot;.
            </p>
            {newMpAccessToken && (
              <p className="mt-1 text-xs">
                {newMpAccessToken.startsWith('TEST-')
                  ? '🟡 Modo prueba (TEST) — los pagos son simulados'
                  : newMpAccessToken.startsWith('APP_USR-')
                  ? '🟢 Modo producción — se cobran pagos reales'
                  : '⚠️ Formato no reconocido'}
              </p>
            )}
          </div>
        </details>
      </Card>
          )}
        </div>
      </div>

      <ModalOverlay
        isOpen={disconnectDialogOpen}
        isDismissable={!disconnecting}
        onOpenChange={setDisconnectDialogOpen}
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-3 backdrop-blur-[1px] sm:p-4"
      >
        <Modal className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none sm:max-h-[90dvh]">
          <Dialog className="flex min-h-0 flex-1 flex-col outline-none">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-4 py-4 sm:px-6">
              <Heading slot="title" className="min-w-0 text-lg font-bold text-[var(--foreground)]">
                Desconectar Mercado Pago
              </Heading>
              <button
                type="button"
                onClick={() => setDisconnectDialogOpen(false)}
                disabled={disconnecting}
                aria-label="Cerrar confirmación de desconexión"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-50"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
              <p slot="description" className="text-sm text-[var(--muted)]">
                Turnea dejará de poder crear nuevos cobros para esta barbería. Tus turnos y pagos históricos no se eliminarán.
              </p>
            </div>
            <div
              className="flex flex-col-reverse gap-3 border-t border-[var(--border)] bg-white px-4 pt-4 sm:flex-row sm:justify-end sm:px-6"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDisconnectDialogOpen(false)}
                disabled={disconnecting}
                autoFocus
                className="w-full sm:w-auto"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void handleDisconnectMercadoPago()}
                disabled={disconnecting}
                className="w-full sm:min-w-36 sm:w-auto"
              >
                {disconnecting ? 'Desconectando…' : 'Desconectar'}
              </Button>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </form>
  )
}
