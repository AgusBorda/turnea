'use client'

import { useState } from 'react'
import { Barber } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { Plus, Pencil, Trash2, X, User, Clock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Props {
  barbershopId: string
  initialBarbers: Barber[]
}

export default function BarbersManager({ barbershopId, initialBarbers }: Props) {
  const [barbers, setBarbers] = useState<Barber[]>(initialBarbers)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Barber | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const [name, setName] = useState('')
  const [bio, setBio] = useState('')

  function openNew() {
    setEditing(null)
    setName('')
    setBio('')
    setShowForm(true)
  }

  function openEdit(barber: Barber) {
    setEditing(barber)
    setName(barber.name)
    setBio(barber.bio || '')
    setShowForm(true)
  }

  async function handleSave() {
    if (!name.trim()) return
    setLoading(true)

    const supabase = createClient()

    if (editing) {
      const { error } = await supabase
        .from('barbers')
        .update({ name: name.trim(), bio: bio.trim() || null })
        .eq('id', editing.id)

      if (!error) {
        setBarbers(barbers.map(b => b.id === editing.id ? { ...b, name: name.trim(), bio: bio.trim() || null } : b))
      }
    } else {
      const { data, error } = await supabase
        .from('barbers')
        .insert({ barbershop_id: barbershopId, name: name.trim(), bio: bio.trim() || null, sort_order: barbers.length })
        .select()
        .single()

      if (!error && data) {
        setBarbers([...barbers, data])

        // Crear schedule por defecto (Lun-Sáb 9 a 20)
        const defaultSchedule = [1, 2, 3, 4, 5, 6].map(day => ({
          barber_id: data.id,
          day_of_week: day,
          start_time: '09:00:00',
          end_time: '20:00:00',
          is_working: true,
        }))
        await supabase.from('barber_schedules').insert(defaultSchedule)
      }
    }

    setShowForm(false)
    setLoading(false)
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este barbero?')) return

    const supabase = createClient()
    const { error } = await supabase.from('barbers').update({ active: false }).eq('id', id)

    if (!error) {
      setBarbers(barbers.filter(b => b.id !== id))
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
        Nuevo barbero
      </button>

      <div className="space-y-3">
        {barbers.length === 0 ? (
          <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center text-[var(--muted)]">
            No hay barberos. Agregá el primero.
          </div>
        ) : (
          barbers.map(barber => (
            <div key={barber.id} className="bg-white rounded-xl border border-[var(--border)] p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-[var(--primary)]" />
                </div>
                <div>
                  <p className="font-medium">{barber.name}</p>
                  {barber.bio && <p className="text-sm text-[var(--muted)]">{barber.bio}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/dashboard/barbers/${barber.id}/schedule`} className="p-2 text-[var(--muted)] hover:text-[var(--primary)] transition-colors" title="Horarios">
                  <Clock className="w-4 h-4" />
                </Link>
                <button onClick={() => openEdit(barber)} className="p-2 text-[var(--muted)] hover:text-[var(--primary)] transition-colors" title="Editar">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(barber.id)} className="p-2 text-[var(--muted)] hover:text-red-500 transition-colors" title="Eliminar">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editing ? 'Editar barbero' : 'Nuevo barbero'}</h3>
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
                  placeholder="Ej: Martín"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Bio / Especialidad</label>
                <input
                  type="text"
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
                  placeholder="Ej: Especialista en fades"
                />
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
                disabled={loading || !name.trim()}
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
