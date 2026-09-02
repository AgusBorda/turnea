import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardLayout from './dashboard-layout'

export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch user's barbershop
  const { data: barbershop } = await supabase
    .from('barbershops')
    .select('id, name')
    .eq('owner_id', user.id)
    .single()

  const { count: pendingReconciliations } = barbershop
    ? await supabase
        .from('payment_reconciliations')
        .select('id', { count: 'exact', head: true })
        .eq('barbershop_id', barbershop.id)
        .in('status', ['pending_review', 'refund_failed'])
    : { count: 0 }

  return (
    <DashboardLayout
      barbershop={barbershop}
      userEmail={user.email || ''}
      pendingReconciliations={pendingReconciliations || 0}
    >
      {children}
    </DashboardLayout>
  )
}
