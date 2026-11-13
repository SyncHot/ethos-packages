#!/bin/sh
# Provision the QEMU engine, then start the service.
#
# The image is a bare Debian: QEMU, noVNC and Python arrive at first start.
# Both the apt lists and the .deb archives are kept in the /data volume, so a
# container recreated by a package update re-installs everything offline in a
# few seconds. If the cache is incomplete the script falls back to the network.
set -eu

CACHE=/data/.engine/apt
LISTS=/data/.engine/lists
STATE=/data/.engine/state
PKGS="python3 qemu-system-x86 qemu-utils novnc ovmf"

mkdir -p "$CACHE" "$LISTS/partial" /data/run /data/.engine
export DEBIAN_FRONTEND=noninteractive

mark() { printf '%s\n' "$1" > "$STATE"; }

ready() {
    command -v qemu-system-x86_64 >/dev/null 2>&1 &&
        command -v qemu-img >/dev/null 2>&1 &&
        command -v python3 >/dev/null 2>&1 &&
        [ -f /usr/share/novnc/core/rfb.js ]
}

APT_OPTS="-y --no-install-recommends -o Dir::State::lists=$LISTS -o Dir::Cache::archives=$CACHE"

if ! ready; then
    mark apt-cache
    if ls "$CACHE"/*.deb >/dev/null 2>&1; then
        echo "reinstalling the engine from the cached packages"
        apt-get $APT_OPTS --no-download install $PKGS ||
            echo "the cache is incomplete, falling back to the network"
    fi
fi

if ! ready; then
    mark apt-download
    echo "downloading the engine packages (first start only)"
    apt-get -o Dir::State::lists="$LISTS" update -qq
    apt-get $APT_OPTS install $PKGS
fi

if ! ready; then
    mark engine-install-failed
    echo "engine provisioning failed: QEMU, noVNC or python3 is still missing" >&2
    exit 1
fi

mark ready
exec python3 /app/app.py
