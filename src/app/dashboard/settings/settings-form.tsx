'use client'

import { useState } from 'react'
import { Barbershop } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ExternalLink } from 'lucide-react'

interface Props {
  barbershop: Barbershop | null
  userId: string
}

export default function SettingsForm({ barbershop, userId }: Props) {
  const [name, setName] = useState(barbershop?.name || '')
  const [slug, setSlug] = useState(barbershop?.slug || '')
  const [description, setDescription] = useState(barbershop?.description || '')
  const [address, setAddress] = useState(barbershop?.address || '')
  const [phone, setPhone] = useState(barbershop?.phone || '')
  const [instagram, setInstagram] = useState(barbershop?.instagram || '')
  const [slotDuration, setSlotDuration] = useState(barbershop?.slot_duration || 30)
  const [depositRequired, setDepositRequired] = useState(barbershop?.deposit_required || false)
  const [depositPercentage, setDepositPercentage] = useState(barbershop?.deposit_percentage || 50)
  const [mpAccessToken, setMpAccessToken] = useState((barbershop as any)?.mp_access_token || '')
  const [advanceBookingDays, setAdvanceBookingDays] = useState(barbershop?.advance_booking_days || 30)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) return

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
      slot_duration: slotDuration,
      deposit_required: depositRequired,
      deposit_percentage: depositPercentage,
      mp_access_token: mpAccessToken.trim() || null,
      advance_booking_days: advanceBookingDays,
    }

    if (barbershop) {
      const { error: err } = await supabase
        .from('barbershops')
        .update(data)
        .eq('id', barbershop.id)

      if (err) {
        setError(err.message.includes('unique') ? 'Ese slug ya está en uso.' : err.message)
      } else {
        setSaved(true)
      }
    } else {
      const { error: err } = await supabase
        .from('barbershops')
        .insert({ ...data, owner_id: userId })

      if (err) {
        setError(err.message.includes('unique') ? 'Ese slug ya está en uso.' : err.message)
      } else {
        setSaved(true)
        router.refresh()
      }
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSave} className="max-w-xl space-y-6">
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3">{error}</div>}
      {saved && <div className="bg-green-50 text-green-600 text-sm rounded-lg p-3">¡Guardado!</div>}

      <div className="bg-white rounded-xl border border-[var(--border)] p-6 space-y-4">
        <h2 className="font-semibold">Datos de la barbería</h2>

        <div>
          <label className="block text-sm font-medium mb-1">Nombre *</label>
          <input
            type="text"
            value={name}
            onChange={e => handleNameChange(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
            placeholder="Ej: Barbería El Tano"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Slug (URL) *</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--muted)]">turnea.app/</span>
            <input
              type="text"
              value={slug}
              onChange={e => setSlug(generateSlug(e.target.value))}
              required
              className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
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

        <div>
          <label className="block text-sm font-medium mb-1">Descripción</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)] resize-none"
            placeholder="Breve descripción de tu barbería"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Dirección</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
              placeholder="Calle 123, Ciudad"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Teléfono</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
              placeholder="1155667788"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Instagram (sin @)</label>
          <input
            type="text"
            value={instagram}
            onChange={e => setInstagram(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
            placeholder="barberia_eltano"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[var(--border)] p-6 space-y-4">
        <h2 className="font-semibold">Configuración de turnos</h2>

        <div>
          <label className="block text-sm font-medium mb-1">Duración del slot (minutos)</label>
          <input
            type="number"
            value={slotDuration}
            onChange={e => setSlotDuration(Number(e.target.value))}
            min={15}
            step={5}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
          />
          <p className="text-xs text-[var(--muted)] mt-1">Intervalo entre turnos disponibles.</p>
        </div>

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

        {depositRequired && (
          <div>
            <label className="block text-sm font-medium mb-1">Porcentaje de seña (%)</label>
            <input
              type="number"
              value={depositPercentage}
              onChange={e => setDepositPercentage(Number(e.target.value))}
              min={10}
              max={100}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>
        )}
      </div>

      {/* Mercado Pago */}
      <div className="bg-white rounded-xl border border-[var(--border)] p-6 space-y-4">
        <div>
          <h2 className="font-semibold">Mercado Pago</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Conectá tu cuenta para cobrar señas automáticamente.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Access Token</label>
          <input
            type="password"
            value={mpAccessToken}
            onChange={e => setMpAccessToken(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)] font-mono text-sm"
            placeholder="APP_USR-xxxx... o TEST-xxxx..."
            autoComplete="off"
          />
          <p className="text-xs text-[var(--muted)] mt-1">
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
          {mpAccessToken && (
            <p className="text-xs mt-1">
              {mpAccessToken.startsWith('TEST-')
                ? '🟡 Modo prueba (TEST) — los pagos son simulados'
                : mpAccessToken.startsWith('APP_USR-')
                ? '🟢 Modo producción — se cobran pagos reales'
                : '⚠️ Formato no reconocido'}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Días disponibles para reservar
          </label>
          <select
            value={advanceBookingDays}
            onChange={e => setAdvanceBookingDays(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
          >
            <option value={7}>1 semana</option>
            <option value={14}>2 semanas</option>
            <option value={21}>3 semanas</option>
            <option value={30}>1 mes</option>
            <option value={60}>2 meses</option>
            <option value={90}>3 meses</option>
          </select>
          <p className="text-xs text-[var(--muted)] mt-1">
            Hasta cuántos días hacia adelante pueden reservar tus clientes.
          </p>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !name.trim() || !slug.trim()}
        className="w-full py-3 bg-[var(--primary)] text-white font-semibold rounded-lg hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50"
      >
        {loading ? 'Guardando...' : barbershop ? 'Guardar cambios' : 'Crear barbería'}
      </button>
    </form>
  )
}
