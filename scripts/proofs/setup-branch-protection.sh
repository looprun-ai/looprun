#!/usr/bin/env bash
# One-shot repo-settings setup for the governance gate (idempotent; requires gh auth with admin on
# the repo). Branch protection is a GitHub setting, not committable code — this script IS the
# documented way to apply what governance/GOVERNANCE.md recommends:
#   - PRs to main require the `ci` check (build + typecheck + tests + proof suite + matrix sync +
#     proof-record gate) and 1 approving review incl. CODE OWNERS (guards.ts / GUARDS.md / governance/).
#   - enforce_admins stays FALSE on purpose: admins/maintainers keep direct-push for day-to-day work;
#     the law binds contributors. Flip to true when the maintainer team grows.
#   - Also creates the maintainer-only `no-proof-needed` escape-hatch label.
set -euo pipefail

REPO="${1:-looprun-ai/looprun}"

echo "→ label no-proof-needed"
gh api "repos/$REPO/labels" \
  -f name='no-proof-needed' -f color='ededed' \
  -f description='Maintainer-only: skip the proof-record gate (see governance/GOVERNANCE.md)' \
  --silent 2>/dev/null || echo "  (label already exists)"

echo "→ branch protection on main"
gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": { "strict": false, "checks": [{ "context": "ci" }] },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "require_code_owner_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false,
  "required_conversation_resolution": false
}
JSON

echo "✓ done — verify at https://github.com/$REPO/settings/branches"
