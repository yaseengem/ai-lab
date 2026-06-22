# Spec: Marketplace Nav & Advanced Filters
**Status:** approved
**Version:** v1
**Date:** 2026-05-06

---

## Problem

The marketplace UI has several gaps that reduce usability and trust:

1. **Browse Agents sidebar is too limited** — only Domain and Status are filterable. Users cannot narrow by live status, version, use-case, or other metadata fields exposed by the platform API.
2. **No quick view for active agents** — users must open Browse Agents and manually select an "active" filter to see running agents. A dedicated entry point saves steps.
3. **Docs link is a dead link** — `['Docs', '#']` in `MarketplaceShell.tsx` goes nowhere; it adds noise and erodes trust.
4. **Sign In button is non-functional** — the button exists in the nav but has no behavior. There are no auth credentials defined anywhere; users cannot authenticate.

---

## Solution

### 1 — Advanced filter sidebar on Browse Agents
Replace the two-section sidebar (Domain / Status) with a full-width "Filters" panel covering every field available on `PlatformAgent`. Filters are applied client-side against the already-fetched agent list. A "Clear all filters" link resets everything.

Filter groups to add:

| Group | Values / Control |
|---|---|
| Domain | Pill list (already exists) |
| Status | Pill list — `active`, `stub` (already exists) |
| Live status | Pill list — `online`, `offline`, `unknown` |
| Use case | Pill list — derived dynamically from loaded agents |
| Version | Pill list — derived dynamically from loaded agents |

No free-text port filter (ports are internal implementation detail, not user-facing).

### 2 — Active Agents nav button
Add a second nav link `Active agents` immediately after `Browse agents` in `MarketplaceShell.tsx`. It routes to `/browse?status=active`, which the existing `BrowseAgentsPage` already handles via the `statusFilter` state seeded from `params.get('industry')`. The param key must be changed from `industry` to `status` to match the filter field, or a dedicated `active` param can be read on mount to pre-select the active filter.

### 3 — Remove Docs from header
Remove the `Docs` entry from the nav links array in `MarketplaceShell.tsx`. Keep the `Docs` link in the footer (it is alongside Privacy / Terms / Security / Status and is acceptable there as a future target).

### 4 — Sign In with local credentials
Add a minimal username/password auth flow:

- **`.env` / `.env.example`** — add `AUTH_USERNAME` and `AUTH_PASSWORD` fields.
- **Platform backend** (`app/`) — add a `POST /api/auth/login` endpoint that reads credentials from env vars and returns a signed JWT (or a simple opaque token) on success.
- **Frontend** — the existing "Sign in" button in `MarketplaceShell.tsx` opens a modal with username + password fields. On success the token is stored in `localStorage` and the button changes to a user avatar / "Sign out" state.
- Auth is **not enforced** on any other route in this spec — this is login UI only, no route guards.

---

## Scope

### In scope

- Extend `BrowseAgentsPage.tsx` sidebar with Live status, Use case, and Version filter groups.
- Change URL param key from `industry` to `status` for the status pre-filter (or add an `active=true` shortcut param).
- Add `Active agents` link in `MarketplaceShell.tsx` nav.
- Remove `Docs` from `MarketplaceShell.tsx` nav links array.
- Add `AUTH_USERNAME` / `AUTH_PASSWORD` to `.env.example` and `.env`.
- Add `POST /api/auth/login` in `app/routers/auth.py` + `app/services/auth_service.py`.
- Add Sign In modal component in `frontend/src/components/auth/SignInModal.tsx`.
- Wire Sign In button in `MarketplaceShell.tsx` to open modal; persist token to `localStorage`.

### Not in scope

- Route-level authentication / protected pages.
- OAuth, SSO, or any third-party identity provider.
- Role-based access control.
- Persistent sessions beyond `localStorage` (no refresh tokens).
- Pagination or server-side filtering on Browse Agents.
- Changing or adding `PlatformAgent` fields in the backend.

---

## Architecture impact

| New file | Purpose |
|---|---|
| `app/routers/auth.py` | `POST /api/auth/login` endpoint |
| `app/services/auth_service.py` | Reads `AUTH_USERNAME` / `AUTH_PASSWORD` from env, validates, returns token |
| `frontend/src/components/auth/SignInModal.tsx` | Modal form; calls `/api/auth/login`; stores token |

Existing files modified:

| File | Change |
|---|---|
| `frontend/src/components/layout/MarketplaceShell.tsx` | Remove Docs nav link; add Active agents link; wire Sign In button to modal |
| `frontend/src/pages/BrowseAgentsPage.tsx` | Extend sidebar with Live status, Use case, Version filters; fix URL param key |
| `app/main.py` | Register `auth` router |
| `.env` / `.env.example` | Add `AUTH_USERNAME` / `AUTH_PASSWORD` |

No new ports. No new agent folders. Stays within `app/` extension pattern defined in CLAUDE.md.

---

## Implementation Checklist

- [x] Add `AUTH_USERNAME` and `AUTH_PASSWORD` to `.env.example` and `.env`
- [x] Create `app/services/auth_service.py` — validate credentials from env, return token
- [x] Create `app/routers/auth.py` — `POST /api/auth/login` using auth service
- [x] Register auth router in `app/main.py`
- [x] Create `frontend/src/components/auth/SignInModal.tsx` — username/password form, calls login endpoint, stores token
- [x] Update `MarketplaceShell.tsx` — remove Docs link, add Active agents link, wire Sign In button to modal
- [x] Update `BrowseAgentsPage.tsx` — add Live status filter group, add Use case filter group, add Version filter group
- [x] Fix URL param in `BrowseAgentsPage.tsx` so `?status=active` pre-selects the active filter
- [ ] Manually verify: Browse Agents sidebar shows all 5 filter groups and filters correctly
- [ ] Manually verify: Active agents link in nav opens Browse Agents pre-filtered to active only
- [ ] Manually verify: Docs link is gone from nav
- [ ] Manually verify: Sign In modal opens, validates credentials from `.env`, stores token, and nav updates to signed-in state

---

## Verification

1. Start platform backend (`app/`) and navigate to `/browse`.
2. Confirm sidebar shows: Domain, Status, Live status, Use case, Version — each with dynamically populated options.
3. Select "unknown" live status — only agents with `live_status: unknown` appear in the grid.
4. Click "Active agents" in the nav — page loads `/browse?status=active` with only `status: active` agents shown.
5. Confirm "Docs" is absent from the nav bar (still present in footer).
6. Click "Sign in" — modal appears with username and password fields.
7. Enter credentials matching `.env` values — modal closes, nav shows signed-in state.
8. Enter wrong credentials — modal shows an error, stays open.
