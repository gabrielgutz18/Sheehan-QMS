#!/usr/bin/env bash
# updates the docker setup to the latest code on GitHub: backs up the data, pulls, builds a new image, restarts
# the docker version of deploy/update.sh (that one is for the systemd service); steps in docs/DEPLOY-DOCKER.md
# run from anywhere: bash /opt/sheehan-queue/deploy/update-docker.sh            (master)
#                    bash /opt/sheehan-queue/deploy/update-docker.sh my-branch  (another branch)
set -euo pipefail

# all in one function, so bash has read the whole script before git pull can change this file
main() {
    local app_dir branch commit status
    app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    branch="${1:-master}"
    cd "$app_dir"

    # the first time there's no container yet, so nothing to back up
    if [ -n "$(docker compose ps -q app 2>/dev/null)" ]; then
        echo "==> Backing up the data"
        docker compose exec -T app node server/backup.js
    fi

    echo "==> Pulling $branch from GitHub"
    git fetch origin
    git checkout "$branch"
    git pull --ff-only origin "$branch"
    commit="$(git rev-parse --short HEAD)"

    echo "==> Building the image for $commit"
    docker compose build
    # keep a copy under the commit's name too, for going back: IMAGE_TAG=<commit> docker compose up -d
    docker tag sheehan-queue:latest "sheehan-queue:$commit"

    echo "==> Restarting the app"
    docker compose up -d

    # healthy once the site answers; a crash on start shows up here instead of on the kiosks
    for _ in $(seq 1 40); do
        status="$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q app)" 2>/dev/null || true)"
        if [ "$status" = "healthy" ]; then
            echo "==> Deployed $commit ($branch), the app is up"
            docker image prune -f >/dev/null
            return 0
        fi
        sleep 3
    done
    echo "The app isn't healthy (status: ${status:-none}). See why: docker compose logs --tail 50" >&2
    return 1
}

main "$@"
