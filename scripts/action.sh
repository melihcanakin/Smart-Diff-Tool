#!/usr/bin/env bash
# Runs semantic-diff for the GitHub Action: writes the step summary, exposes outputs,
# creates or updates a single PR comment, and fails the job only after all of that is done.
#
# Inputs come from the environment (never interpolated into the script) so a hostile branch
# name cannot inject commands:
#   SD_BASE SD_FEATURE SD_THRESHOLD SD_COMMENT SD_IGNORE   from the action inputs
#   ACTION_PATH       where this action is checked out
#   GITHUB_REPOSITORY PR_NUMBER GH_TOKEN                   for the PR comment
#   GITHUB_STEP_SUMMARY GITHUB_OUTPUT RUNNER_TEMP          provided by the runner
set -uo pipefail

: "${SD_BASE:?base is required}" "${SD_FEATURE:?feature is required}" "${ACTION_PATH:?}"
tmp="${RUNNER_TEMP:-$(mktemp -d)}"
cli=(node "$ACTION_PATH/dist/cli.js")

args=()
[[ -n "${SD_THRESHOLD:-}" ]] && args+=(--threshold "$SD_THRESHOLD")
while IFS= read -r pattern; do
  [[ -n "$pattern" ]] && args+=(--ignore "$pattern")
done <<<"${SD_IGNORE:-}"

# One analysis; the JSON and Markdown reports are rendered from the same run via the cache.
"${cli[@]}" "$SD_BASE" "$SD_FEATURE" "${args[@]}" --quiet --output "$tmp/semantic-diff.md"
status=$?
if [[ $status -ne 0 && $status -ne 1 ]]; then
  echo "::error::semantic-diff failed with exit code $status" >&2
  exit "$status"
fi
"${cli[@]}" "$SD_BASE" "$SD_FEATURE" "${args[@]}" --quiet --output "$tmp/semantic-diff.json" || true

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  cat "$tmp/semantic-diff.md" >>"$GITHUB_STEP_SUMMARY"
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "ratio=$(jq -r '.totals.ratio' "$tmp/semantic-diff.json")"
    echo "total=$(jq -r '.totals.total' "$tmp/semantic-diff.json")"
    echo "semantic=$(jq -r '.totals.semantic' "$tmp/semantic-diff.json")"
    echo "noise=$(jq -r '.totals.noise' "$tmp/semantic-diff.json")"
    echo "report=$tmp/semantic-diff.json"
  } >>"$GITHUB_OUTPUT"
fi

if [[ "${SD_COMMENT:-false}" == "true" && -n "${PR_NUMBER:-}" ]]; then
  marker='<!-- semantic-diff -->'
  comments="repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments"
  existing=$(gh api "$comments" --paginate \
    --jq "[.[] | select(.body | contains(\"$marker\"))][0].id // empty" 2>/dev/null | head -n1)

  if [[ -n "$existing" ]]; then
    gh api --method PATCH "repos/${GITHUB_REPOSITORY}/issues/comments/${existing}" \
      -F "body=@$tmp/semantic-diff.md" >/dev/null
  else
    gh api --method POST "$comments" -F "body=@$tmp/semantic-diff.md" >/dev/null
  fi || echo "::warning::Could not post the PR comment (a token from a fork cannot write comments)."
fi

exit "$status"
