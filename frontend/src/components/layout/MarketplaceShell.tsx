/**
 * MarketplaceShell — top-level layout for marketplace pages (01-05 wireframes).
 * Provides a fixed nav bar with light theme; page content renders via <Outlet />.
 */

import { Link, useNavigate, Outlet } from 'react-router-dom'

export function MarketplaceShell() {
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--t)' }}>
      {/* Fixed nav */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, height: 56, padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.95)', borderBottom: '1px solid var(--b)', backdropFilter: 'blur(8px)' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
          <div style={{ width: 30, height: 30, background: 'var(--ac)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>🤖</div>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)' }}>Neural<span style={{ color: 'var(--ac)' }}>AI</span></span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {[['Browse agents', '/browse'], ['Dashboard', '/dashboard'], ['Docs', '#']].map(([label, path]) => (
            <Link key={label as string} to={path as string} style={{ fontSize: 13, color: 'var(--t2)', textDecoration: 'none', transition: 'color .15s' }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.color = 'var(--t)' }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'var(--t2)' }}>
              {label}
            </Link>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-sm">Sign in</button>
          <button className="btn btn-sm btn-p" onClick={() => navigate('/browse')}>Get started</button>
        </div>
      </nav>

      {/* Page content */}
      <Outlet />

      {/* Footer */}
      <footer style={{ padding: '20px 40px', borderTop: '1px solid var(--b)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--s)' }}>
        <span style={{ fontSize: 12, color: 'var(--t3)' }}>© 2026 Neural AI Agents. All rights reserved.</span>
        <div style={{ display: 'flex', gap: 20 }}>
          {['Privacy', 'Terms', 'Security', 'Docs', 'Status'].map((l) => (
            <a key={l} href="#" style={{ fontSize: 12, color: 'var(--t3)', textDecoration: 'none' }}>{l}</a>
          ))}
        </div>
      </footer>
    </div>
  )
}
