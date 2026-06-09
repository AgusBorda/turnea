'use client'

import { useState } from 'react'
import { Service } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { formatPrice, formatDuration } from '@/lib/utils'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  barbershopId: string
  initialServices: Service[]
}

export default function ServicesManager({ barbershopId, initialServices }: Props) {
  const [services, setServices] = useState<Service[]>(initialServices)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState(30)
  const [price, setPrice] = useState(0)

  function openNew() {
    setEditing(null)
    setName('')
    setDescription('')
    setDuration(30)
    setPrice(0)
    setShowForm(true)
  }

  function openEdit(service: Service) {
    setEditing(service)
    setName(service.name)
    setDescription(service.description || '')
    setDuration(service.duration)
    setPrice(service.price)
    setShowForm(true)
  }

  async function handleSave() {
    if (!name.trim() || duration <= 0 || price < 0) return
    setLoading(true)

    const supabase = createClient()

    if (editing) {
      const { error } = await supabase
        .from('services')
        .update({ name: name.trim(), description: description.trim() || null, duration, price })
        .eq('id', editing.id)

      if (!error) {
        setServices(services.map(s => s.id === editing.id ? { ...s, name: name.trim(), description: description.trim() || null, duration, price } : s))
      }
    } else {
      const { data, error } = await supabase
        .from('services')
        .insert({ barbershop_id: barbershopId, name: name.trim(), description: description.trim() || null, duration, price, sort_order: services.length })
        .select()
        .single()

      if (!error && data) {
        setServices([...services, data])
      }
    }

    setShowForm(false)
    setLoading(false)
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este servicio?')) return

    const supabase = createClient()
    const { error } = await supabase.from('services').update({ active: false }).eq('id', id)

    if (!error) {
      setServices(services.filter(s => s.id !== id))
      router.refresh()
    }
  }

  return (
    <div>
      <button
        onClick={openNew}
        className="mb-4 flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-medium hover:bg-[var(--primary-dark)] transition-colors"
      >
        <Plus className="w-4 h-4" />
        Nuevo servicio
      </button>

      {/* List */}
      <div className="space-y-3">
        {services.length === 0 ? (
          <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center text-[var(--muted)]">
            No hay servicios. Creá el primero.
          </div>
        ) : (
          services.map(service => (
            <div key={service.id} className="bg-white rounded-xl border border-[var(--border)] p-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{service.name}</p>
                <p className="text-sm text-[var(--muted)]">
                  {formatDuration(service.duration)} · {formatPrice(service.price)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(service)} className="p-2 text-[var(--muted)] hover:text-[var(--primary)] transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(service.id)} className="p-2 text-[var(--muted)] hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editing ? 'Editar servicio' : 'Nuevo servicio'}</h3>
              <button onClick={() => setShowForm(false)}>
                <X className="w-5 h-5 text-[var(--muted)]" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Nombre *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
                  placeholder="Ej: Corte clásico"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Descripción</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
                  placeholder="Ej: Incluye lavado"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Duración (min) *</label>
                  <input
                    type="number"
                    value={duration}
                    onChange={e => setDuration(Number(e.target.value))}
                    min={5}
                    step={5}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Precio ($) *</label>
                  <input
                    type="number"
                    value={price}
                    onChange={e => setPrice(Number(e.target.value))}
                    min={0}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2 border border-[var(--border)] rounded-lg font-medium hover:bg-[var(--secondary)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={loading || !name.trim() || duration <= 0}
                className="flex-1 py-2 bg-[var(--primary)] text-white rounded-lg font-medium hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50"
              >
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
