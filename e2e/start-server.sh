#!/usr/bin/env bash
# Starts DSH from source in an isolated home with this plugin installed, ready for
# the scenarios in this directory. Nothing outside E2E_ROOT is touched: telemetry
# is off and the default workspace is redirected away from ~/Documents.
#
#   DSH_REPO=/path/to/deepseek-harness e2e/start-server.sh [--keep]
#
# --keep reuses the existing home, which is how the resume scenario restarts.
# Set DSH_BIN to run a packaged runtime instead of the checkout, for example the one
# inside DSH Desktop. DSH_REPO is still needed: the scenarios take Playwright from it.
set -euo pipefail

: "${DSH_REPO:?set DSH_REPO to a built deepseek-harness checkout}"
E2E_ROOT="${E2E_ROOT:-/tmp/dsh-ccgui-e2e}"
E2E_PORT="${E2E_PORT:-3199}"
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="$E2E_ROOT/docs/deepseek-harness/default-workspace"

run_dsh() {
  if [[ -n "${DSH_BIN:-}" ]]; then
    "$DSH_BIN" "$@"
  else
    (cd "$DSH_REPO" && pnpm -s dsh "$@")
  fi
}

export DSH_HOME="$E2E_ROOT/home"
export DSH_TELEMETRY_DISABLED=1

if [[ "${1:-}" != "--keep" ]]; then
  rm -rf "$E2E_ROOT"
  mkdir -p "$DSH_HOME" "$WORKSPACE"
  git -C "$WORKSPACE" init -q .
  git -C "$WORKSPACE" -c user.email=e2e@example.invalid -c user.name=e2e commit -q --allow-empty -m init
  # A free model, and an explicit ask so permission requests actually occur.
  cat > "$WORKSPACE/opencode.json" <<'JSON'
{"$schema":"https://opencode.ai/config.json","model":"opencode/deepseek-v4.1-flash-free","permission":{"edit":"ask","bash":"ask"}}
JSON
  echo 'opencode.json' >> "$WORKSPACE/.git/info/exclude"
  # Claude Code starts in its auto mode, which rarely asks. Delete this file to test that.
  mkdir -p "$WORKSPACE/.claude"
  echo '{"permissions":{"defaultMode":"default"}}' > "$WORKSPACE/.claude/settings.json"
  echo '.claude/' >> "$WORKSPACE/.git/info/exclude"
  run_dsh --profile web --dump-config > /dev/null
  run_dsh plugin --profile web add "$PLUGIN_DIR" > /dev/null 2>&1
fi

cat > "$E2E_ROOT/e2e.patch.yml" <<YAML
- id: ccgui
  name: dsh-ccgui
  config:
    cancelGraceMs: 3000
    agents:
      - id: claude
        name: Claude Code
        command: npx
        args: [-y, '@agentclientprotocol/claude-agent-acp@0.101.0']
      - id: kimi
        name: Kimi CLI
        command: npx
        args: [-y, '@moonshot-ai/kimi-code@2.5.2', acp]
      - id: codex
        name: Codex CLI
        command: npx
        args: [-y, '@agentclientprotocol/codex-acp@2.5.0']
      - id: pi
        name: PI CLI
        command: npx
        args: [-y, 'pi-acp@0.0.34']
      - id: omp
        name: OMP CLI
        command: omp
        args: [acp]
      - id: opencode
        name: OpenCode
        command: opencode
        args: [acp]
      - id: codebuddy
        name: CodeBuddy CLI
        command: codebuddy
        args: [--acp]
      - id: fake
        name: Fake CLI
        command: node
        args: ['$PLUGIN_DIR/tests/fixtures/fake-acp-agent.mjs']
      - id: missing
        name: Missing CLI
        command: dsh-ccgui-no-such-command
- id: workspace-controller
  name: '@deepseek-ai/dsh-api-workspace-controller'
  config:
    documentsDirectory: $E2E_ROOT/docs
YAML

run_dsh --profile web --patch "$E2E_ROOT/e2e.patch.yml" --no-open --port "$E2E_PORT" > "$E2E_ROOT/server.log" 2>&1
