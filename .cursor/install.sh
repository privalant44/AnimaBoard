#!/usr/bin/env bash
# One-time, idempotent setup for the AnimaBoard Cloud Agent environment.
# Runs after the repository is checked out. Installs system dependencies
# (Docker engine + fuse-overlayfs, required to run the local Supabase stack)
# and project dependencies. Must terminate and be safe to re-run.
set -euo pipefail

echo "==> [install] Installing system dependencies"

# Docker engine: needed to run the local Supabase stack (supabase start).
if ! command -v dockerd >/dev/null 2>&1; then
  echo "==> [install] Docker not found — installing via get.docker.com"
  curl -fsSL https://get.docker.com | sudo sh
else
  echo "==> [install] Docker already installed: $(dockerd --version 2>/dev/null | head -1)"
fi

# fuse-overlayfs: Docker's overlay2 driver cannot mount overlay-on-overlay in
# the nested Cloud Agent container, so we use the fuse-overlayfs storage driver.
if ! command -v fuse-overlayfs >/dev/null 2>&1; then
  echo "==> [install] Installing fuse-overlayfs"
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -y
  # --force-confold keeps any existing /etc/fuse.conf so the install stays
  # non-interactive (the base image already ships that conffile).
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    -o Dpkg::Options::=--force-confold \
    -o Dpkg::Options::=--force-confdef \
    fuse-overlayfs
fi

# Configure the Docker daemon to use fuse-overlayfs and the classic graph
# driver (disabling the containerd overlayfs snapshotter, which fails to mount
# nested overlays in this environment).
echo "==> [install] Writing /etc/docker/daemon.json"
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<'JSON'
{
  "features": { "containerd-snapshotter": false },
  "storage-driver": "fuse-overlayfs"
}
JSON

# Allow the non-root user to talk to the Docker socket.
sudo groupadd -f docker
sudo usermod -aG docker "$(id -un)" || true

echo "==> [install] Installing Node dependencies (root)"
cd "$(dirname "$0")/.."
npm install

echo "==> [install] Installing Node dependencies (client)"
cd client && npm install && cd ..

echo "==> [install] Done"
