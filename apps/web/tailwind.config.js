/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        brand: { DEFAULT: '#2563eb', soft: '#eef3ff', ink: '#0a0f1c' },
        line: '#e7ebf3',
        canvas: '#f6f8fc'
      },
      boxShadow: { card: '0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.04)', pop: '0 12px 40px -8px rgba(15,23,42,.18), 0 2px 8px rgba(15,23,42,.06)' },
      keyframes: {
        pageIn: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideIn: { from: { transform: 'translateX(24px)', opacity: 0 }, to: { transform: 'none', opacity: 1 } },
        popIn: { from: { opacity: 0, transform: 'translateY(-6px) scale(.98)' }, to: { opacity: 1, transform: 'none' } },
        grow: { from: { transform: 'scaleY(0)' }, to: { transform: 'scaleY(1)' } },
        draw: { from: { strokeDashoffset: 1 }, to: { strokeDashoffset: 0 } }
      },
      animation: { page: 'pageIn .28s ease-out both', fade: 'fadeIn .2s ease-out both', slide: 'slideIn .25s ease-out both', pop: 'popIn .16s ease-out both' }
    }
  },
  plugins: []
}
