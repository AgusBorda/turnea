import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { X } from 'lucide-react'
import Link from 'next/link'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ external_reference?: string }>
}

export default async function CancelPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const sp = await searchParams
  const appointmentId = sp.external_reference

  const supabase = await createClient()
  const { data: barbershop } = await supabase
    .from('barbershops')
    .select('name, slug')
    .eq('slug', slug)
    .single()

  if (!barbershop) notFound()

  // Cancel the appointment if it exists and is still pending_payment
  if (appointmentId) {
    await supabase
      .from('appointments')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: 'client' })
      .eq('id', appointmentId)
      .eq('status', 'pending_payment')
  }

  return (
    <main className="min-h-screen bg-[var(--secondary)] flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <X className="w-10 h-10 text-gray-500" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Reserva cancelada</h1>
        <p className="text-[var(--muted)] mb-8">
          No se realizó ningún cobro. Podés intentarlo de nuevo cuando quieras.
        </p>
        <Link
          href={`/${slug}`}
          className="inline-block px-8 py-3 bg-[var(--primary)] text-white font-semibold rounded-xl hover:bg-[var(--primary-dark)] transition-colors"
        >
          Volver a reservar
        </Link>
      </div>
    </main>
  )
}
