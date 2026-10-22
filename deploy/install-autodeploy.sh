#!/usr/bin/env bash
# One-time setup, run on the server as root:
#   ssh ampere2 'sudo bash -s' < deploy/install-autodeploy.sh
# Replaces /opt/hypedrive-crm/src with a clone of the repo (the old copy is kept
# as src.pre-autodeploy) and starts the timer.
set -euo pipefail

ROOT=/opt/hypedrive-crm
REPO=${REPO_URL:-https://github.com/Shivam8584/sales-crm.git}

cd "$ROOT"
if [ ! -d src/.git ]; then
  rm -rf src.pre-autodeploy
  [ -d src ] && mv src src.pre-autodeploy
  git clone --quiet --branch main "$REPO" src
fi
cp src/deploy/hypedrive-crm-autodeploy.service src/deploy/hypedrive-crm-autodeploy.timer /etc/systemd/system/
chmod +x src/deploy/autodeploy.sh
touch /var/log/hypedrive-crm-deploy.log
systemctl daemon-reload
systemctl enable --now hypedrive-crm-autodeploy.timer
systemctl list-timers hypedrive-crm-autodeploy.timer --no-pager | head -3
