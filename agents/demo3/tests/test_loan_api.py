# Test module for Loan Processing Agent API
#
# Covers:
#   - POST /process        — initiate a new loan application via direct API
#   - POST /upload         — submit documents via file upload
#   - GET  /status/{id}    — poll workflow state
#   - POST /chat/{id}      — chat as user / support / admin role
#   - POST /approve/{id}   — trigger human approval
#   - POST /reject/{id}    — trigger rejection
#   - GET  /rules          — fetch current agent ruleset
#   - POST /rules          — update agent ruleset (admin)
#
# Run:  pytest test/loan/test_loan_api.py
