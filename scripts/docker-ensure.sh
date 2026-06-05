#!/usr/bin/env bash
# Ensure we can talk to the Docker daemon (macOS Docker Desktop, Colima, etc.).
# Source from other scripts:  source "${_SCRIPT_DIR}/docker-ensure.sh"

docker_ensure() {
  if docker info &>/dev/null 2>&1; then
    return 0
  fi

  # Docker Desktop for Mac: socket is not always at /var/run/docker.sock
  if [[ "$(uname -s)" == "Darwin" ]]; then
    local mac_sock="${HOME}/.docker/run/docker.sock"
    if [[ -S "$mac_sock" ]]; then
      export DOCKER_HOST="unix://${mac_sock}"
      if docker info &>/dev/null 2>&1; then
        return 0
      fi
    fi
  fi

  # Colima
  local colima_sock="${HOME}/.colima/default/docker.sock"
  if [[ -S "$colima_sock" ]]; then
    export DOCKER_HOST="unix://${colima_sock}"
    if docker info &>/dev/null 2>&1; then
      return 0
    fi
  fi

  # OrbStack
  local orb_sock="${HOME}/.orbstack/run/docker.sock"
  if [[ -S "$orb_sock" ]]; then
    export DOCKER_HOST="unix://${orb_sock}"
    if docker info &>/dev/null 2>&1; then
      return 0
    fi
  fi

  # Docker Desktop 4.x: active context is often "desktop-linux"; stale "default" breaks the CLI
  local ctx
  for ctx in desktop-linux default colima orbstack; do
    if env -u DOCKER_HOST DOCKER_CONTEXT="$ctx" docker info &>/dev/null 2>&1; then
      unset -v DOCKER_HOST 2>/dev/null || true
      export DOCKER_CONTEXT="$ctx"
      return 0
    fi
  done

  echo >&2 "Cannot connect to the Docker daemon (no engine running, wrong context, or wrong socket)."
  echo >&2 ""
  echo >&2 "  • Confirm Docker Desktop is running, then try:"
  echo >&2 "      docker context use desktop-linux"
  echo >&2 "      docker info"
  echo >&2 "  • List contexts:  docker context ls"
  echo >&2 "  • If you use Colima/OrbStack, ensure that backend is started."
  echo >&2 ""
  return 1
}

if ! docker_ensure; then
  exit 1
fi
