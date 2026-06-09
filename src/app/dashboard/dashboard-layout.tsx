'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Barbershop } from '@/lib/types'
import {
  LayoutDashboard,
  Calendar,
  Scissors,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useState } from 'react'

interface Props {
  barbershop: Barbershop | null
  userEmail: string
  children: React.ReactNode
}

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Inicio' },
  { href: '/dashboard/agenda', icon: Calendar, label: 'Agenda' },
  { href: '/dashboard/services', icon: Scissors, label: 'Servicios' },
  { href: '/dashboard/barbers', icon: Users, label: 'Barberos' },
  { href: '/dashboard/settings', icon: Settings, label: 'Configuración' },
]

export default function DashboardLayout({ barbershop, userEmail, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex h-screen bg-[var(--secondary)]">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-[var(--border)] transform transition-transform lg:translate-x-0 lg:static ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-4 border-b border-[var(--border)]">
            <div className="flex items-center justify-between">
              <Link href="/dashboard" className="text-xl font-bold text-[var(--primary)]">
                Turnea
              </Link>
              <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
                <X className="w-5 h-5" />
              </button>
            </div>
            {barbershop && (
              <p className="text-sm text-[var(--muted)] mt-1 truncate">{barbershop.name}</p>
            )}
          </div>

          {/* Nav */}
          <nav className="flex-1 p-3 space-y-1">
            {navItems.map(item => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                      : 'text-[var(--muted)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* User */}
          <div className="p-3 border-t border-[var(--border)]">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs text-[var(--muted)] truncate">{userEmail}</span>
              <button
                onClick={handleLogout}
                className="text-[var(--muted)] hover:text-red-500 transition-colors"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar mobile */}
        <header className="lg:hidden bg-white border-b border-[var(--border)] px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-[var(--primary)]">Turnea</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
