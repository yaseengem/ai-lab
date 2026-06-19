/**
 * NotFoundPage — 404 fallback.
 */

import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="text-6xl">🤖</span>
      <h1 className="text-3xl font-bold text-gray-900">404</h1>
      <p className="text-gray-500">The page you're looking for doesn't exist.</p>
      <Link
        to="/"
        className="mt-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
      >
        Go Home
      </Link>
    </div>
  )
}
