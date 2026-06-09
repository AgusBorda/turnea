import Link from 'next/link'
import {
  Scissors, Calendar, Clock, Star, MessageCircle,
  DollarSign, Users, Smartphone, Check, ArrowRight, Zap
} from 'lucide-react'

export default function HomePage() {
  return (
    <main className="flex-1 overflow-x-hidden">

      {/* NAV */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl">
            <Scissors className="w-6 h-6 text-[var(--primary)]" />
            Turnea
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors hidden sm:block"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/login"
              className="text-sm px-4 py-2 bg-[var(--primary)] text-white font-semibold rounded-lg hover:bg-[var(--primary-dark)] transition-colors"
            >
              Empezar gratis
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative bg-gradient-to-br from-[var(--primary)] via-[var(--primary)] to-[var(--primary-dark)] text-white overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 py-20 sm:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">

            {/* Left — Texto */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-sm mb-6">
                <Zap className="w-4 h-4 text-yellow-300" />
                <span>100% gratis para empezar</span>
              </div>
              <h1 className="text-5xl sm:text-6xl font-bold leading-tight">
                Tu agenda,<br />
                <span className="text-yellow-300">sola.</span>
              </h1>
              <p className="mt-6 text-lg text-white/80 max-w-lg">
                Tus clientes reservan online las 24hs. Vos dejás de responder
                WhatsApp y te enfocás en lo que sabés hacer: cortar.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/login"
                  className="px-8 py-3.5 bg-white text-[var(--primary)] font-bold rounded-xl hover:bg-yellow-50 transition-colors text-center"
                >
                  Crear mi barbería gratis
                </Link>
                <a
                  href="#como-funciona"
                  className="px-8 py-3.5 border-2 border-white/25 text-white font-semibold rounded-xl hover:bg-white/10 transition-colors text-center"
                >
                  Cómo funciona
                </a>
              </div>
              <div className="mt-8 flex items-center gap-3 text-sm text-white/70">
                <div className="flex -space-x-2">
                  {['P', 'M', 'F', 'D'].map(l => (
                    <div
                      key={l}
                      className="w-8 h-8 rounded-full bg-white/20 border-2 border-[var(--primary)] flex items-center justify-center text-xs font-bold"
                    >
                      {l}
                    </div>
                  ))}
                </div>
                <span>Más de 50 barberías ya lo usan</span>
              </div>
            </div>

            {/* Right — Mockup visual */}
            <div className="relative hidden lg:flex items-center justify-center py-8">
              {/* Booking confirmation card */}
              <div className="bg-white text-[var(--foreground)] rounded-2xl shadow-2xl p-6 w-72">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <Check className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">¡Turno confirmado!</p>
                    <p className="text-xs text-[var(--muted)]">Recibirás un recordatorio</p>
                  </div>
                </div>
                <div className="border border-[var(--border)] rounded-xl p-4 space-y-2.5 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--muted)]">📅 Fecha</span>
                    <span className="font-medium">Sáb 7, 10:00</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--muted)]">✂️ Servicio</span>
                    <span className="font-medium">Corte + Barba</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--muted)]">👤 Barbero</span>
                    <span className="font-medium">Pablo</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--muted)]">💳 Seña</span>
                    <span className="font-medium text-green-600">Pagada ✓</span>
                  </div>
                </div>
                <p className="text-center text-xs text-[var(--muted)] mt-3">
                  Reservado en 28 segundos · Sin registrarse
                </p>
              </div>

              {/* Chip — facturación */}
              <div className="absolute -top-2 -right-6 bg-white text-[var(--foreground)] rounded-xl shadow-lg px-4 py-3">
                <p className="text-xs text-[var(--muted)]">Facturado este mes</p>
                <p className="font-bold text-lg text-green-600">$142.500</p>
              </div>

              {/* Chip — mensajes */}
              <div className="absolute -bottom-2 -left-6 bg-white text-[var(--foreground)] rounded-xl shadow-lg px-4 py-3 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">WhatsApp coordinando</p>
                  <p className="font-bold text-red-500 line-through text-sm">+50 mensajes/día</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* PAIN POINTS */}
      <section className="py-16 bg-[var(--foreground)] text-white">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">
            ¿Te pasa alguno de estos?
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { emoji: '📱', text: 'Estás cortando y el teléfono no para de vibrar con consultas.' },
              { emoji: '😩', text: 'Tu cliente pregunta a las 11pm "¿tenés para el sábado?"' },
              { emoji: '🗓️', text: 'Los turnos en papel o en el chat se pisan entre barberos.' },
              { emoji: '💸', text: 'Te plantaron y perdiste plata porque no cobraste seña.' },
            ].map(({ emoji, text }) => (
              <div key={text} className="bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/10 transition-colors">
                <span className="text-3xl">{emoji}</span>
                <p className="mt-3 text-white/80 text-sm leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-white/60 mt-8 text-sm">
            Si te identificaste con alguno →{' '}
            <strong className="text-yellow-300">Turnea es para vos.</strong>
          </p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="como-funciona" className="py-20 bg-[var(--secondary)]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold">Empezás en minutos</h2>
            <p className="text-[var(--muted)] mt-2">Sin configuraciones complicadas. Sin técnicos.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                num: '01',
                title: 'Configurás tu barbería',
                desc: 'Cargás tu nombre, servicios con precios, barberos y sus horarios. Todo listo en 10 minutos.',
                icon: <Scissors className="w-6 h-6" />,
              },
              {
                num: '02',
                title: 'Compartís tu link',
                desc: 'Poné tu link único en la bio de Instagram, en el estado de WhatsApp o donde quieras.',
                icon: <Smartphone className="w-6 h-6" />,
              },
              {
                num: '03',
                title: 'Cortás tranquilo',
                desc: 'Tus clientes reservan solos. Vos recibís todo ordenado en tu agenda online.',
                icon: <Check className="w-6 h-6" />,
              },
            ].map(({ num, title, desc, icon }) => (
              <div
                key={num}
                className="relative bg-white rounded-2xl p-8 border border-[var(--border)] hover:border-[var(--primary)] hover:shadow-lg transition-all group"
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 rounded-xl bg-[var(--primary)] text-white flex items-center justify-center group-hover:scale-110 transition-transform">
                    {icon}
                  </div>
                  <span className="text-4xl font-black text-[var(--border)]">{num}</span>
                </div>
                <h3 className="text-lg font-bold mb-2">{title}</h3>
                <p className="text-[var(--muted)] text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold">Todo lo que necesitás</h2>
            <p className="text-[var(--muted)] mt-2">Diseñado específicamente para barberías argentinas.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: <Calendar className="w-7 h-7" />,
                title: 'Reservas online 24/7',
                desc: 'Tu página pública donde cualquier cliente puede ver disponibilidad y reservar. Sin registrarse, sin bajar apps.',
              },
              {
                icon: <Users className="w-7 h-7" />,
                title: 'Multi-barbero',
                desc: 'Cada barbero tiene su propia agenda y horarios. El cliente elige con quién quiere atenderse.',
              },
              {
                icon: <DollarSign className="w-7 h-7" />,
                title: 'Señas con Mercado Pago',
                desc: 'Configurá señas automáticas y cobralas antes del turno. Reducís los plantones al mínimo.',
              },
              {
                icon: <Clock className="w-7 h-7" />,
                title: 'Agenda visual',
                desc: 'Mirá tu semana de un vistazo. Creá turnos manuales, cancelá y gestioná todo desde el dashboard.',
              },
              {
                icon: <Star className="w-7 h-7" />,
                title: 'Estadísticas reales',
                desc: 'Facturación por día, semana y mes. Servicios más pedidos. Toda la data que necesitás para crecer.',
              },
              {
                icon: <MessageCircle className="w-7 h-7" />,
                title: 'Sin app para el cliente',
                desc: 'El cliente entra al link, elige y reserva. Sin descargas, sin registros. En menos de 30 segundos.',
              },
            ].map(({ icon, title, desc }) => (
              <div
                key={title}
                className="group p-6 rounded-2xl border border-[var(--border)] hover:border-[var(--primary)] hover:shadow-lg transition-all"
              >
                <div className="text-[var(--primary)] mb-4 inline-block group-hover:scale-110 transition-transform">
                  {icon}
                </div>
                <h3 className="text-lg font-bold mb-2">{title}</h3>
                <p className="text-[var(--muted)] text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* IMPACT NUMBERS */}
      <section className="py-16 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-dark)] text-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid sm:grid-cols-3 gap-8 text-center">
            <div>
              <p className="text-6xl font-black text-yellow-300">30s</p>
              <p className="mt-3 text-white/80">para que tu cliente reserve su turno</p>
            </div>
            <div>
              <p className="text-6xl font-black text-yellow-300">0</p>
              <p className="mt-3 text-white/80">mensajes de WhatsApp para coordinar</p>
            </div>
            <div>
              <p className="text-6xl font-black text-yellow-300">100%</p>
              <p className="mt-3 text-white/80">gratis para empezar hoy mismo</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-24">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="bg-[var(--secondary)] rounded-3xl p-12 border border-[var(--border)]">
            <div className="w-16 h-16 rounded-2xl bg-[var(--primary)] flex items-center justify-center mx-auto mb-5">
              <Scissors className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Empezá hoy. Es gratis.
            </h2>
            <p className="text-[var(--muted)] text-lg mb-8">
              Configurá tu barbería en 10 minutos. Sin tarjeta de crédito, sin compromisos.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-10 py-4 bg-[var(--primary)] text-white font-bold rounded-xl hover:bg-[var(--primary-dark)] transition-colors text-lg"
            >
              Crear mi barbería gratis
              <ArrowRight className="w-5 h-5" />
            </Link>
            <p className="mt-4 text-sm text-[var(--muted)]">
              ¿Ya tenés cuenta?{' '}
              <Link href="/login" className="text-[var(--primary)] hover:underline font-medium">
                Iniciar sesión
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[var(--border)] py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[var(--muted)]">
          <div className="flex items-center gap-2">
            <Scissors className="w-4 h-4 text-[var(--primary)]" />
            <span className="font-semibold text-[var(--foreground)]">Turnea</span>
          </div>
          <p>&copy; {new Date().getFullYear()} Turnea. Hecho con ✂️ en Argentina.</p>
          <Link href="/login" className="hover:text-[var(--primary)] transition-colors">
            Iniciar sesión
          </Link>
        </div>
      </footer>

    </main>
  )
}
