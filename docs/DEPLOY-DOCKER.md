# Running it in Docker (on the Ubuntu VM)

The same app as [DEPLOY-UBUNTU.md](DEPLOY-UBUNTU.md), but in a container instead of the `sheehan-queue` systemd service. Everything else in that guide still applies: the Hyper-V switch and fixed IP (step 1), the timezone (step 2), the deploy key (step 4), the firewall, nginx and HTTPS (step 8), and the screens (step 10). Node no longer needs to be installed on the VM: it's inside the image.

| What | Where |
|---|---|
| Code (a `git clone`, with `Dockerfile` and `compose.yaml`) | `/opt/sheehan-queue` |
| Database, video, photos | `/var/lib/sheehan-queue/data` on the VM, `/data` in the container |
| Backups | `/var/backups/sheehan-queue` on the VM, `/backups` in the container |
| Settings | `/opt/sheehan-queue/.env`, the same file as before |
| Runs as | the container `sheehan-queue-app-1`, as the `sheehan` user's id, restarted by Docker at boot |

The data stays in the same folders as the systemd setup, so switching over keeps every order, and you can switch back.

## Why it's set up this way

- **Host networking** (`network_mode: host`). With Docker's usual bridge network, every kiosk reaches the app from one Docker address, so the rate limiter would count the whole shop as one client and start answering 429. Published bridge ports also skip ufw. On the host network, ufw and nginx work exactly as before.
- **`TZ=Asia/Manila`** in `compose.yaml`. Containers run on UTC by default, and queue numbers restart at midnight by the container's clock.
- **Read-only container.** Like the systemd service's sandbox, it can only write to `/data` and `/backups`.

## 1. Install Docker

Use Docker's own packages, not Ubuntu's `docker.io` (older, and without `docker compose`):

```bash
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

Let your login user run it without `sudo`, then log out and back in:

```bash
sudo usermod -aG docker "$USER"
```

Being in the `docker` group is as good as root on this VM, so give it only to the people who already have `sudo`.

## 2. Settings

The folders and the `sheehan` user from DEPLOY-UBUNTU step 5 stay. A new VM needs that step first (the `useradd` and `mkdir` lines, the clone and `.env`), but not `npm ci` or the build.

In `/opt/sheehan-queue/.env`, add the `sheehan` user's ids, so the container owns its files the same way the service did:

```bash
cd /opt/sheehan-queue
echo "APP_UID=$(id -u sheehan)" >> .env
echo "APP_GID=$(id -g sheehan)" >> .env
```

`DATA_DIR` and `BACKUP_DIR` in `.env` can stay. Inside the container they're replaced with `/data` and `/backups`. `PORT` still decides the port.

**A `$` in a value** (e.g. in `ADMIN_PASSWORD`): Docker reads `$` as the start of a variable, so write it as `$$`. Without Docker, `.env` takes it as is.

## 3. Switch over from the systemd service

Both can't hold port 3000 at once, so stop the service first:

```bash
sudo systemctl disable --now sheehan-queue
cd /opt/sheehan-queue
bash deploy/update-docker.sh
```

The first build takes a few minutes. It ends with `Deployed <commit> (master), the app is up`. Open `http://<server-ip>` (or `:3000`) from a PC and sign in at `/staff`.

## 4. Daily backups

The backup now runs inside the container, so the cron job goes in **your** crontab (you're in the `docker` group), not the `sheehan` user's:

```bash
sudo crontab -u sheehan -r   # removes the old line, if step 9 was ever done
crontab -e
```

```
0 20 * * * cd /opt/sheehan-queue && docker compose exec -T app node server/backup.js >> "$HOME/sheehan-backup.log" 2>&1
```

The log goes in your home folder because the backup folder belongs to `sheehan`, and cron runs this as you.

Check it once: `docker compose exec app node server/backup.js`. As before, copy `/var/backups/sheehan-queue` off the VM now and then.

## Day to day

Run these from `/opt/sheehan-queue`.

| Do | Command |
|---|---|
| Update to master | `bash deploy/update-docker.sh` (or `... my-branch`) |
| Watch the logs | `docker compose logs -f` |
| Last 50 lines | `docker compose logs --tail 50` |
| Is it running, and healthy? | `docker compose ps` |
| Restart / stop / start | `docker compose restart` (or `stop`, `start`) |
| Back up now | `docker compose exec app node server/backup.js` |
| Free the disk of old images | `docker image ls sheehan-queue`, then `docker rmi sheehan-queue:<commit>` for old ones |

`update-docker.sh` backs up first, builds an image named after the commit as well as `latest`, restarts, and waits until the site answers.

**Going back to an older version:** `IMAGE_TAG=<commit> docker compose up -d` (the commits are in `docker image ls sheehan-queue`). To go forward again: `docker compose up -d`. As with systemd, if that version is older than a migration that already ran, restore the backup taken just before the update.

**Going back to systemd:** `docker compose down`, then DEPLOY-UBUNTU step 6 (`npm ci`, `npm run build`), then `sudo systemctl enable --now sheehan-queue`. The data folders are the same.

**Automatic deploys** (DEPLOY-UBUNTU step 12) still run `deploy/update.sh`, the systemd one. Point the job at `update-docker.sh` before turning the runner on with Docker.

## When something's wrong

| Problem | Fix |
|---|---|
| `address already in use` | The systemd service is still running: `sudo systemctl disable --now sheehan-queue` |
| `EACCES` / permission denied on `/data` or `/backups` | `APP_UID`/`APP_GID` in `.env` don't own the folders: `sudo chown -R sheehan:sheehan /var/lib/sheehan-queue /var/backups/sheehan-queue` |
| `permission denied ... docker.sock` | You're not in the `docker` group yet: step 1, then log out and in |
| Admin password doesn't work | A `$` in `.env` (step 2) |
| Queue numbers reset at the wrong hour | `TZ` in `compose.yaml`; check with `docker compose exec app date` |
| `unhealthy`, or keeps restarting | `docker compose logs --tail 50` shows why |
