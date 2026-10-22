# Deploying on Ubuntu 22.04 (Hyper-V VM)

How to run the app on an Ubuntu 22.04 LTS server, pulled from GitHub, so every kiosk, display and counter on the network uses it. For the Windows server, see [README → Deployment](README.md#deployment).

| What | Where on the server |
|---|---|
| Code (a `git clone` of this repo) | `/opt/sheehan-queue` |
| Database, display video, staff photos (`DATA_DIR`) | `/var/lib/sheehan-queue/data` |
| Daily backups (`BACKUP_DIR`) | `/var/backups/sheehan-queue` |
| Runs as | the `sheehan-queue` systemd service, user `sheehan` |
| Address | `http://<server-ip>:3000` (or `http://<server-ip>` with nginx, step 8) |

Code and data are in separate folders, so `git pull` never touches the database.

```
Kiosks / display / counters ──http──▶ Ubuntu VM ── node server/server.js ──▶ /var/lib/sheehan-queue/data/queue.db
                                         ▲
                     GitHub (master) ────┘ git pull  (bash deploy/update.sh: by hand, or by the runner in step 12)
```

## 0. On your PC first: get master up to date

The server deploys the `master` branch. Push your work and merge it into `master` on GitHub (pull request → Merge), including the `deploy/` folder and this file. Check that `master` has everything: `server/migrations/` should go up to the newest migration.

## 1. Hyper-V: put the VM on your network

The **Default Switch** is NAT: only the Windows host can reach the VM, not the kiosks. Use an External switch.

1. Hyper-V Manager → **Virtual Switch Manager** → New virtual network switch → **External** → pick the physical network adapter (wired Ethernet if you can) → tick *Allow management operating system to share this network adapter* → OK.
2. VM → **Settings** → Network Adapter → Virtual switch: the External switch.
3. VM → Settings → **Automatic Start Action**: *Always start this virtual machine automatically*. **Automatic Stop Action**: *Shut down the guest operating system*. Now the app comes back by itself after the host reboots.
4. In the VM, check the IP:

   ```bash
   ip -br a
   ```

   You want an address from your office network (e.g. `192.168.1.x`). A `172.x.x.x` address means it's still on the Default Switch.

### Give it a fixed IP

Kiosks need an address that doesn't change. The easiest way is a **DHCP reservation** for the VM's MAC address in your router. Or set it in Ubuntu: edit the file in `/etc/netplan/` (e.g. `00-installer-config.yaml`), using your interface name from `ip -br a` and your network's numbers:

```yaml
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: false
      addresses: [192.168.1.50/24]
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses: [192.168.1.1, 8.8.8.8]
```

```bash
sudo netplan try
```

`netplan try` rolls back by itself after 2 minutes unless you press Enter, so a typo can't lock you out of SSH. After it's applied, SSH back in on the new IP.

## 2. Prepare Ubuntu

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl
```

**Set the timezone.** Queue numbers start again at 1 every day by the server's clock, and Ubuntu defaults to UTC, which would reset the queue in the middle of your day. Use your own zone (`timedatectl list-timezones` lists them):

```bash
sudo timedatectl set-timezone Asia/Manila
timedatectl
```

## 3. Install Node.js 24

The app needs Node 22.13 or newer (the database is built into Node). Ubuntu's own `nodejs` package is far older, so install it from NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

`node -v` should print `v24.something`.

## 4. Let the server read the repo from GitHub

**Public repo:** skip to step 5 and clone with `https://github.com/gabrielgutz18/Sheehan-QMS.git`.

**Private repo:** give the server its own read-only **deploy key**:

```bash
ssh-keygen -t ed25519 -C "sheehan-ubuntu-server" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
```

Copy the printed line. On GitHub: the repo → **Settings** → **Deploy keys** → **Add deploy key** → paste it, leave *Allow write access* off → Add key. Then:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github.com
```

Answer `yes` to the fingerprint question. GitHub replies *"You've successfully authenticated"*.

## 5. Folders, user and code

```bash
# a user with no login, just for running the app
sudo useradd --system --no-create-home --shell /usr/sbin/nologin sheehan

sudo mkdir -p /opt/sheehan-queue /var/lib/sheehan-queue/data /var/backups/sheehan-queue
sudo chown "$USER":"$USER" /opt/sheehan-queue
sudo chown -R sheehan:sheehan /var/lib/sheehan-queue /var/backups/sheehan-queue

git clone git@github.com:gabrielgutz18/Sheehan-QMS.git /opt/sheehan-queue
cd /opt/sheehan-queue
```

You own the code (you pull and build it); the `sheehan` user can only read it and write to the data folders.

### `.env`

```bash
cp .env.example .env
nano .env
```

Set these (and remove or comment out the Windows paths):

```ini
VITE_API_URL=/api
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<a strong password>
DATA_DIR=/var/lib/sheehan-queue/data
BACKUP_DIR=/var/backups/sheehan-queue
PORT=3000
```

Save (Ctrl+O, Enter, Ctrl+X), then let the app read it but nobody else:

```bash
sudo chgrp sheehan .env
chmod 640 .env
```

`.env` is in `.gitignore`, so it stays on the server and `git pull` never changes it.

## 6. Build and try it

```bash
npm ci
npm run build
sudo -u sheehan node --env-file=.env server/server.js
```

You should see `Sheehan queue running on http://localhost:3000` and `Data folder: /var/lib/sheehan-queue/data`. From your PC, open `http://<server-ip>:3000` and sign in at `/admin`. Then press Ctrl+C to stop it.

## 7. Run it as a service

Starts at boot, restarts if it crashes:

```bash
sudo cp deploy/sheehan-queue.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sheehan-queue
systemctl status sheehan-queue
```

| Do | Command |
|---|---|
| Watch the logs | `journalctl -u sheehan-queue -f` |
| Last 50 lines | `journalctl -u sheehan-queue -n 50` |
| Restart / stop / start | `sudo systemctl restart sheehan-queue` (or `stop`, `start`) |

## 8. Firewall

Allow SSH **before** turning the firewall on, or you'll lock yourself out. Change `192.168.1.0/24` to your network, so only office PCs can reach the app:

```bash
sudo ufw allow OpenSSH
sudo ufw allow from 192.168.1.0/24 to any port 3000 proto tcp
sudo ufw enable
sudo ufw status
```

### Optional: port 80 with nginx

So kiosks open `http://<server-ip>` without `:3000`:

```bash
sudo apt install -y nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/sheehan-queue
sudo ln -s /etc/nginx/sites-available/sheehan-queue /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo ufw allow from 192.168.1.0/24 to any port 80 proto tcp
sudo ufw delete allow from 192.168.1.0/24 to any port 3000 proto tcp
```

`deploy/nginx.conf` already allows the 200 MB display-video upload.

## 9. Daily backups

```bash
sudo crontab -u sheehan -e
```

Add this line (8 PM every day; `npm run backup` keeps the newest 14):

```
0 20 * * * cd /opt/sheehan-queue && /usr/bin/node --env-file=.env server/backup.js >> /var/lib/sheehan-queue/backup.log 2>&1
```

Run one now to check: `sudo -u sheehan node --env-file=.env server/backup.js`.

These backups are on the VM's own disk. Now and then copy them off it, e.g. from your PC:

```bash
scp -r <user>@<server-ip>:/var/backups/sheehan-queue ./sheehan-backups
```

## 10. Kiosks, display and counters

| Screen | Open |
|---|---|
| Display screen | `http://<server-ip>:3000/`, opened with `deploy\display-screen.cmd` (below) |
| Admin | `http://<server-ip>:3000/admin` |
| Customer order (admin and sales) | `http://<server-ip>:3000/admin/customer-order` |
| Sales counter | `http://<server-ip>:3000/sales` |

On the Windows PC that drives the display screen, copy [`deploy/display-screen.cmd`](deploy/display-screen.cmd) from this repo, set `SERVER` at the top to the server's address (with nginx, `http://<server-ip>`), and double-click it. It opens the display full screen in its own Microsoft Edge window (Chrome if Edge isn't installed) that's allowed to play sound, so calls are read out without anyone clicking the page. Edge has Microsoft's natural voices (Ava, Emma, Jenny, Rosa for Philippine English, ...): pick one under Admin → Call announcements with the admin page open in Edge, so it's a voice the display has too. Put a shortcut to it in `shell:startup` to open the display when Windows starts. Opened any other way, the browser keeps the display silent after every start or reload until someone clicks on the page.

Orders are taken by staff in Admin → Customer order; there is no customer kiosk. Tickets print through the browser: after Serve, **Print ticket** opens the print preview with just the ticket, and staff pick the printer there. Any printer installed in Windows on that PC works, including one shared from another computer on the network (add it once in Windows: Settings → Printers & scanners → Add device, or open `\\<computer>` in File Explorer and double-click the printer). Nothing needs to run on the staff PCs.

## 11. Updating (the GitHub workflow)

1. On your PC: work on a branch, push, open a pull request into `master`, merge it.
2. On the server:

   ```bash
   cd /opt/sheehan-queue
   bash deploy/update.sh
   ```

[`deploy/update.sh`](deploy/update.sh) backs up the data, pulls `master`, runs `npm ci` and `npm run build`, and restarts the service. New migrations run by themselves when it starts. To try a branch on the server: `bash deploy/update.sh my-branch`.

**Going back to an older version:** `git log --oneline`, then `git checkout <commit>`, `npm ci && npm run build`, `sudo systemctl restart sheehan-queue`. If that version is older than a migration that already ran, restore the backup `update.sh` made just before (see README → Database → Backups).

Don't edit code on the server: change it on your PC and push, so GitHub always has what's running.

## 12. Deploy automatically when master changes (optional)

GitHub can't reach a VM inside your office network, so the VM collects the work itself: a GitHub Actions **self-hosted runner** on the VM waits for the *Deploy to the Ubuntu server* job in [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml). After every push or merge to `master`, once lint and build pass, it runs `bash deploy/update.sh`, exactly what you'd run by hand in step 11. Pull requests never run on it.

> **Public repo?** Anyone can open a pull request, and a pull request can change the workflow to run its own code on your runner, inside your office network. GitHub recommends self-hosted runners only for **private** repos. If yours stays public: Settings → Actions → General → *Approval for running fork pull request workflows from contributors* → **Require approval for all external contributors**, and approve only pull requests you've read.

### Install the runner

On the VM, as your own login user (the one that owns `/opt/sheehan-queue`, not root). On GitHub: the repo → **Settings** → **Actions** → **Runners** → **New self-hosted runner** → Linux, x64. Run the commands it shows; on the `./config.sh` line, add `--labels sheehan-server` at the end:

```bash
./config.sh --url https://github.com/gabrielgutz18/Sheehan-QMS --token <token from that page> --labels sheehan-server
```

Press Enter for the other questions. Then make it a service, so it starts at boot:

```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

The Runners page now shows it as **Idle**. The runner runs as your user, so it pulls with the deploy key from step 4.

### Let it back up and restart without a password

`update.sh` uses `sudo` twice, and a runner can't type a password. [`deploy/sudoers`](deploy/sudoers) allows exactly those two commands and nothing else. Install it with a check first (a broken file in `/etc/sudoers.d` would break `sudo`):

```bash
sed "s/YOUR_USER/$USER/" /opt/sheehan-queue/deploy/sudoers > /tmp/sheehan-deploy
sudo visudo -cf /tmp/sheehan-deploy && sudo install -m 440 -o root -g root /tmp/sheehan-deploy /etc/sudoers.d/sheehan-deploy
rm /tmp/sheehan-deploy
```

Test it: `sudo -k` (forgets your password), then `bash /opt/sheehan-queue/deploy/update.sh`. It should run to the end without asking for a password. If it asks, the app isn't in `/opt/sheehan-queue`, or `update.sh` and `deploy/sudoers` no longer match.

### Switch it on

GitHub: **Settings** → **Secrets and variables** → **Actions** → **Variables** tab → **New repository variable**: name `DEPLOY_SERVER`, value `true`.

Until it's set, the job is skipped. That's on purpose: a job for a runner that doesn't exist yet would sit waiting for a day and hold up every later run on master.

### Using it

| Do | How |
|---|---|
| Deploy | Merge a pull request into `master` (or push to it) |
| See what happened | **Actions** tab → the run → *Deploy to the Ubuntu server*. It shows the `update.sh` output and turns red if the app doesn't answer after the restart |
| Deploy again without a change | Actions → CI/CD → **Run workflow** on `master` |
| Pause automatic deploys | Set `DEPLOY_SERVER` to `false` |
| Runner's own logs (on the VM) | `journalctl -u 'actions.runner.*' -f` |

## 13. Bringing over the data from your PC (optional)

**Copy the whole data folder.** Stop `npm run dev` on your PC first. Then, from the project folder on your PC:

```bash
scp -r data <user>@<server-ip>:/tmp/sheehan-data
```

On the server, replace the empty database from step 6:

```bash
sudo systemctl stop sheehan-queue
sudo rm -rf /var/lib/sheehan-queue/data/*
sudo cp -r /tmp/sheehan-data/. /var/lib/sheehan-queue/data/
sudo chown -R sheehan:sheehan /var/lib/sheehan-queue/data
sudo systemctl start sheehan-queue
rm -rf /tmp/sheehan-data
```

Or use the snapshot seeder (`npm run snapshot` on the PC, copy `seeders/` into `/opt/sheehan-queue`, then `sudo -u sheehan node --env-file=.env server/snapshot.js load` on the server); see README → Taking the current data to another computer.

## When something's wrong

| Problem | Fix |
|---|---|
| Other PCs can't open the page | VM on the Default Switch (step 1), firewall (step 8), or wrong IP (`ip -br a`) |
| Service won't start | `journalctl -u sheehan-queue -n 50` shows why |
| `Set ADMIN_USERNAME and ADMIN_PASSWORD in .env` | `.env` missing those, or not readable: `sudo chgrp sheehan .env && chmod 640 .env` |
| `bad option: --env-file` or `No such built-in module: node:sqlite` | Old Node: redo step 3, check `node -v` |
| `EACCES` / permission denied on the data folder | `sudo chown -R sheehan:sheehan /var/lib/sheehan-queue` |
| Queue numbers reset at the wrong hour | Timezone (step 2) |
| `The site isn't built yet` | `npm run build`, then restart the service |
| Video upload fails with `413` behind nginx | Use `deploy/nginx.conf` (it sets `client_max_body_size 200m`) |
| Display shows the calls but makes no sound | Open it with `deploy\display-screen.cmd` (step 10). In an ordinary browser tab, click the display page once after every start or reload |
| `git pull` asks for a password or is denied | Deploy key (step 4); `ssh -T git@github.com` to test |
| Deploy job: `sudo: a terminal is required to read the password` | The sudoers rule isn't installed or doesn't match (step 12) |
| Deploy job stays *Queued* | Runner offline: `sudo ./svc.sh status` in `~/actions-runner`, or a missing `sheehan-server` label |
