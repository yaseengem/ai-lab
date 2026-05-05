# Spec: EC2 Deployment
**Status:** draft
**Version:** v1
**Date:** 2026-05-05

---

## Problem

All three agents run locally but there is no production deployment. The platform needs to be accessible on a public EC2 instance with all services running reliably on boot and a single Nginx entry point to avoid CORS issues.

---

## Solution

Deploy Neural to a single EC2 instance:
- React frontend built and served by Nginx
- Three FastAPI agent backends managed by systemd (auto-start, auto-restart)
- Nginx reverse-proxies `/api/claims/`, `/api/underwriting/`, `/api/loan/` to the correct ports
- A single deploy script that reproduces the full environment from scratch

---

## Scope

### In scope
- Nginx config serving the React build and proxying all three agent APIs
- systemd service files for each uvicorn process
- Shell deploy script for a fresh EC2 instance
- EC2-specific `.env` documentation

### Not in scope
- HTTPS / SSL termination (future)
- Auto-scaling or load balancing (future)
- Docker / containerisation (covered in ep7-agentcore)
- CI/CD pipeline (future)

---

## Architecture impact

New folder: `infrastructure/`

```
infrastructure/
  nginx/
    neural.conf          ← Nginx site config
  systemd/
    neural-demo1.service
    neural-demo2.service
    neural-demo3.service
  deploy-ec2.sh          ← one-shot deploy script
```

No changes to `app/`, `agents/`, or `frontend/`. Ports come from `config.yaml` — no hardcoding.

---

## Implementation Checklist

### Nginx
- [ ] `infrastructure/nginx/neural.conf` — serves React build from `/var/www/neural/`
- [ ] Proxy `/api/claims/` → `localhost:3001`
- [ ] Proxy `/api/underwriting/` → `localhost:3002`
- [ ] Proxy `/api/loan/` → `localhost:3003`
- [ ] SSE proxying: `proxy_buffering off`, `X-Accel-Buffering no` on all `/chat/` locations

### systemd
- [ ] `neural-demo1.service` — uvicorn for Claims on port 3001
- [ ] `neural-demo2.service` — uvicorn for Underwriting on port 3002
- [ ] `neural-demo3.service` — uvicorn for Loan on port 3003
- [ ] Each service: `Restart=on-failure`, `RestartSec=5`, loads `.env` via `EnvironmentFile=`

### Deploy script
- [ ] `infrastructure/deploy-ec2.sh` installs Python 3.11, Node.js 20, Nginx
- [ ] Installs Python deps from root `requirements.txt`
- [ ] Builds React frontend (`npm run build`) and copies to Nginx root
- [ ] Copies and enables systemd service files
- [ ] Copies `.env` from local or prompts if missing
- [ ] Prints public IP and all service URLs at end

### Environment
- [ ] `.env.ec2.example` at repo root with EC2-specific values documented

---

## Verification

1. Run `./infrastructure/deploy-ec2.sh` on a fresh EC2 instance — completes without errors
2. `curl http://{EC2_IP}/api/claims/ping` → `{"status":"ok","agent":"claims"}`
3. `curl http://{EC2_IP}/api/underwriting/ping` → `{"status":"ok","agent":"underwriting"}`
4. `curl http://{EC2_IP}/api/loan/ping` → `{"status":"ok","agent":"loan"}`
5. `http://{EC2_IP}` — Neural frontend loads, agent cards visible
6. Submit a test claim through the UI — SSE streams correctly through Nginx
7. `sudo systemctl stop neural-demo1` → service restarts automatically within 5 s
8. Reboot EC2 → all three services start on boot without manual intervention
