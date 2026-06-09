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
    .select('*')
    .eq('owner_id', user.id)
    .single()

  return (
    <DashboardLayout barbershop={barbershop} userEmail={user.email || ''}>
      {children}
    </DashboardLayout>
  )
}
