#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
REPO_ROOT="${SCRIPT_DIR:h:h}"
RUNNER="${SCRIPT_DIR}/run-guyana-opportunity-collector.sh"
LABEL="com.lumenstech.guyana-opportunity-collector"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs/CompCRM"

mkdir -p "${HOME}/Library/LaunchAgents" "${LOG_DIR}"
chmod +x "${RUNNER}"

cat > "${PLIST}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>${RUNNER}</string>
  </array>
  <key>StartInterval</key>
  <integer>10800</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>${REPO_ROOT}</string>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/guyana-opportunity-collector.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/guyana-opportunity-collector.error.log</string>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
PLIST

plutil -lint "${PLIST}"
launchctl bootout "gui/${UID}/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/${UID}" "${PLIST}"
launchctl enable "gui/${UID}/${LABEL}"
launchctl kickstart -k "gui/${UID}/${LABEL}"

print "Installed ${LABEL}."
print "Schedule: every 10800 seconds (3 hours), plus RunAtLoad."
print "Environment file: ${GUYANA_COLLECTOR_ENV_FILE:-${REPO_ROOT}/.env.guyana-collector}"
print "Logs: ${LOG_DIR}/guyana-opportunity-collector.log"
