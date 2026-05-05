# Test module for Claims Processing Agent API
#
# Covers:
#   - POST /process        — initiate a new claim via direct API
#   - POST /upload         — submit a claim document via file upload
#   - GET  /status/{id}    — poll workflow state
#   - POST /chat/{id}      — chat as user / support / admin role
#   - POST /approve/{id}   — trigger human approval
#   - POST /reject/{id}    — trigger rejection
#   - GET  /rules          — fetch current agent ruleset
#   - POST /rules          — update agent ruleset (admin)
#
# Run:  pytest test/claims/test_claims_api.py
