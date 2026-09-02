import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PublicBarber, PublicBarbershop, PublicService } from '@/lib/types'
import BookingFlow from './booking-flow'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function BarbershopPage({ params }: PageProps) {
  const { slug } = await params
  const supabase = await createClient()

  // Fetch barbershop
  const { data: barbershopData } = await supabase
    .rpc('get_public_barbershop_by_slug', { p_slug: slug })
    .maybeSingle()
  const barbershop = barbershopData as PublicBarbershop | null

  if (!barbershop) notFound()

  // Fetch barbers
  const { data: barbers, error: barbersError } = await supabase.rpc(
    'get_public_barbers',
    { p_barbershop_id: barbershop.id }
  )

  if (barbersError) {
    throw new Error('Failed to load public barbers')
  }

  // Fetch services
  const { data: servicesData, error: servicesError } = await supabase.rpc(
    'get_public_services',
    { p_barbershop_id: barbershop.id }
  )

  if (servicesError) {
    throw new Error('Failed to load public services')
  }
  const services = (servicesData || []) as PublicService[]

  return (
    <main className="min-h-screen bg-[var(--secondary)]">
      {/* Header de la barbería */}
      <header className="bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)] text-white">
        <div className="max-w-lg mx-auto px-4 py-8 text-center">
          {barbershop.logo_url && (
            <img
              src={barbershop.logo_url}
              alt={barbershop.name}
              className="w-20 h-20 rounded-full mx-auto mb-4 border-2 border-white/30 object-cover"
            />
          )}
          <h1 className="text-2xl font-bold">{barbershop.name}</h1>
          {barbershop.description && (
            <p className="mt-1 text-white/70 text-sm">{barbershop.description}</p>
          )}
          <div className="mt-3 flex items-center justify-center gap-4 text-sm text-white/60">
            {barbershop.instagram && (
              <a
                href={`https://instagram.com/${barbershop.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-white transition-colors"
              >
                <span className="text-xs">IG</span>
                @{barbershop.instagram}
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Booking flow */}
      <div className="max-w-lg mx-auto px-4 py-6">
        <BookingFlow
          barbershop={barbershop}
          barbers={(barbers || []) as PublicBarber[]}
          services={services}
          mpConfigured={barbershop.mp_configured}
        />
      </div>
    </main>
  )
}
