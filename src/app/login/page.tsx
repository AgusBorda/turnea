'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Scissors } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    const supabase = createClient()

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      })
      if (error) {
        setError(error.message)
      } else {
        setMessage('Te enviamos un email de confirmación. Revisá tu bandeja.')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        setError('Email o contraseña incorrectos.')
      } else {
        router.push('/dashboard')
      }
    }

    setLoading(false)
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--secondary)] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-2xl font-bold text-[var(--primary)]">
            <Scissors className="w-7 h-7" />
            Turnea
          </Link>
          <p className="mt-2 text-[var(--muted)]">
            {isSignUp ? 'Creá tu cuenta' : 'Ingresá a tu panel'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 border border-[var(--border)] space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3">{error}</div>
          )}
          {message && (
            <div className="bg-green-50 text-green-600 text-sm rounded-lg p-3">{message}</div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)] transition-colors"
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)] transition-colors"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[var(--primary)] text-white font-semibold rounded-lg hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50"
          >
            {loading ? 'Cargando...' : isSignUp ? 'Crear cuenta' : 'Ingresar'}
          </button>

          <p className="text-center text-sm text-[var(--muted)]">
            {isSignUp ? '¿Ya tenés cuenta?' : '¿No tenés cuenta?'}{' '}
            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setError(''); setMessage('') }}
              className="text-[var(--primary)] font-medium hover:underline"
            >
              {isSignUp ? 'Ingresar' : 'Registrarte'}
            </button>
          </p>
        </form>
      </div>
    </main>
  )
}
