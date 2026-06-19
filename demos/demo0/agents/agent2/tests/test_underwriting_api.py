# Test module for Underwriting Agent API
#
# Covers:
#   - POST /process        — initiate a new underwriting case via direct API
#   - POST /upload         — submit documents via file upload
#   - GET  /status/{id}    — poll workflow state
#   - POST /chat/{id}      — chat as user / support / admin role
#   - POST /approve/{id}   — trigger human approval
#   - POST /reject/{id}    — trigger rejection
#   - GET  /rules          — fetch current agent ruleset
#   - POST /rules          — update agent ruleset (admin)
#
# Run:  pytest test/underwriting/test_underwriting_api.py
