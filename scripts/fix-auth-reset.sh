#!/usr/bin/env bash
#
# Reads the current Supabase Auth config, shows the fields we care about, then
# (only with --apply) patches the password-reset email to a device- and
# scanner-proof token-hash link, sets Site URL, and MERGES the reset/callback
# redirect URLs into the existing allow-list (never clobbers it).
#
# Usage:
#   export PROJECT_REF=xxxxxxxxxxxxxxxx          # app.supabase.com/project/<THIS>
#   export SUPABASE_PAT=sbp_xxxxxxxxxxxxxxxx     # app.supabase.com/account/tokens
#   ./scripts/fix-auth-reset.sh                  # dry run — shows current + planned
#   ./scripts/fix-auth-reset.sh --apply          # actually writes the change
#
# Requires: curl, jq
set -euo pipefail

: "${PROJECT_REF:?Set PROJECT_REF (from your dashboard URL)}"
: "${SUPABASE_PAT:?Set SUPABASE_PAT (personal access token, starts sbp_)}"

API="https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth"
SITE_URL="https://dashboard.fednavigator.com"
WANT_URLS=("${SITE_URL}/reset-password" "${SITE_URL}/auth/callback")
SUBJECT="Reset your Fed Navigator password"
read -r -d '' CONTENT <<'HTML' || true
<h2>Reset your password</h2>
<p><a href="{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery">Reset Password</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>
HTML

echo "→ Fetching current auth config for project ${PROJECT_REF}…"
CURRENT=$(curl -fsS -H "Authorization: Bearer ${SUPABASE_PAT}" "${API}")

CUR_SITE=$(jq -r '.site_url // ""' <<<"$CURRENT")
CUR_ALLOW=$(jq -r '.uri_allow_list // ""' <<<"$CURRENT")
CUR_SUBJECT=$(jq -r '.mailer_subjects_recovery // ""' <<<"$CURRENT")

echo
echo "================ CURRENT ================"
echo "site_url                 : ${CUR_SITE}"
echo "uri_allow_list           : ${CUR_ALLOW}"
echo "recovery email subject   : ${CUR_SUBJECT}"
echo "recovery email body      :"
jq -r '.mailer_templates_recovery_content // "(empty)"' <<<"$CURRENT" | sed 's/^/    /'
echo "========================================"

# Merge desired redirect URLs into the existing allow-list (split on comma,
# trim, dedupe, keep existing order, then append any missing ones).
MERGED_ALLOW=$(
  WANT="$(printf '%s\n' "${WANT_URLS[@]}")" jq -rn --arg cur "$CUR_ALLOW" '
    ($cur | split(",") | map(gsub("^\\s+|\\s+$";"")) | map(select(length>0))) as $have
    | ($ENV.WANT | split("\n") | map(select(length>0))) as $want
    | ($have + ($want | map(select(. as $w | $have | index($w) | not))))
    | join(",")
  '
)

echo
echo "================ PLANNED ================"
echo "site_url                 : ${SITE_URL}"
echo "uri_allow_list (merged)  : ${MERGED_ALLOW}"
echo "recovery email subject   : ${SUBJECT}"
echo "recovery email body      :"
printf '%s\n' "$CONTENT" | sed 's/^/    /'
echo "========================================"

if [[ "${1:-}" != "--apply" ]]; then
  echo
  echo "Dry run only. Re-run with --apply to write these changes."
  exit 0
fi

PAYLOAD=$(jq -n \
  --arg site "$SITE_URL" \
  --arg allow "$MERGED_ALLOW" \
  --arg subject "$SUBJECT" \
  --arg content "$CONTENT" \
  '{site_url:$site, uri_allow_list:$allow, mailer_subjects_recovery:$subject, mailer_templates_recovery_content:$content}')

echo
echo "→ Applying…"
curl -fsS -X PATCH "${API}" \
  -H "Authorization: Bearer ${SUPABASE_PAT}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" >/dev/null
echo "✓ Done. Have an affected .gov user try the reset again."
