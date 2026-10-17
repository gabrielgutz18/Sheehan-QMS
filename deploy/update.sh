#!/usr/bin/env bash
# updates the Ubuntu server to the latest code on GitHub: backs up the data, pulls, rebuilds, restarts
# the data folder (DATA_DIR) is never touched; new migrations run by themselves on the restart
# run from anywhere: bash /opt/sheehan-queue/deploy/update.sh            (master)
#                    bash /opt/sheehan-queue/deploy/update.sh my-branch  (another branch)
# the "Deploy to the Ubuntu server" job in .github/workflows/ci-cd.yml runs this too; its two sudo commands
# match deploy/sudoers word for word, so keep them in step
set -euo pipefail

# all in one function, so bash has read the whole script before git pull can change this file
main() {
    local app_dir branch port
    app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    branch="${1:-master}"
    cd "$app_dir"

    echo "==> Backing up the data"
    sudo -u sheehan /usr/bin/node --env-file="$app_dir/.env" "$app_dir/server/backup.js"

    echo "==> Pulling $branch from GitHub"
    git fetch origin
    git checkout "$branch"
    git pull --ff-only origin "$branch"

    echo "==> Installing packages and building the site"
    npm ci
    npm run build

    echo "==> Restarting the app"
    sudo systemctl restart sheehan-queue

    # the site answers once the server is listening; a crash on start shows up here instead of on the kiosks
    port="$(sed -n 's/^PORT=//p' .env | tail -n 1)"
    port="${port:-3000}"
    for _ in $(seq 1 15); do
        if curl -fsS -o /dev/null "http://127.0.0.1:$port/"; then
            echo "==> Deployed $(git rev-parse --short HEAD) ($branch), the app is up on port $port"
            return 0
        fi
        sleep 1
    done
    echo "The app isn't answering on port $port. See why: journalctl -u sheehan-queue -n 50" >&2
    return 1
}

main "$@"
