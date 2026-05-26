# Déploiement Ubuntu pour Remake Intercom

Domaines utilisés :

```text
intercom.remakemedia.fr       frontend React
intercom-api.remakemedia.fr   backend API + WebSocket
intercom-livekit.remakemedia.fr moteur audio WebRTC LiveKit
```

## 1. DNS

Dans ta zone DNS `remakemedia.fr`, ajoute :

```text
intercom            A      IP_DE_TON_VPS
intercom-api        A      IP_DE_TON_VPS
intercom-livekit    A      IP_DE_TON_VPS
```

Ajoute aussi les `AAAA` si ton VPS a une IPv6.

## 2. Préparer le serveur

```bash
sudo apt update
sudo apt install -y nginx git curl build-essential
```

Installer Node.js 22 :

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

Créer l'utilisateur applicatif :

```bash
sudo adduser --system --group --home /opt/remake-intercom intercom
sudo mkdir -p /opt/remake-intercom
sudo chown -R intercom:intercom /opt/remake-intercom
```

## 3. MySQL existant

Comme tu as déjà MySQL sur le serveur, crée seulement la base et l'utilisateur si ce n'est pas déjà fait :

```bash
sudo mysql
```

```sql
CREATE DATABASE remake_intercom CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'intercom'@'localhost' IDENTIFIED BY 'MOT_DE_PASSE_FORT';
GRANT ALL PRIVILEGES ON remake_intercom.* TO 'intercom'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Si tu as déjà un user MySQL, garde-le et adapte `DATABASE_URL`.

## 4. Copier le projet

Exemple avec Git :

```bash
cd /opt/remake-intercom
sudo -u intercom git clone TON_REPO_GIT .
```

Ou envoie les fichiers par SFTP/rsync dans `/opt/remake-intercom`.

## 5. Backend

```bash
cd /opt/remake-intercom/backend
sudo -u intercom cp .env.example .env
sudo -u intercom nano .env
```

Configuration production :

```env
NODE_ENV=production
PORT=4000
DATABASE_URL="mysql://intercom:MOT_DE_PASSE_FORT@127.0.0.1:3306/remake_intercom"
JWT_SECRET="GENERE_UN_SECRET_LONG_ALEATOIRE"
JWT_EXPIRES_IN="12h"
CORS_ORIGIN="https://intercom.remakemedia.fr"
LIVEKIT_URL="wss://intercom-livekit.remakemedia.fr"
LIVEKIT_API_KEY="devkey"
LIVEKIT_API_SECRET="CHANGE_ME_LIVEKIT_SECRET"
```

Installer, migrer, build :

```bash
cd /opt/remake-intercom/backend
sudo -u intercom npm ci
sudo -u intercom npm run prisma:generate
sudo -u intercom npm run prisma:deploy
sudo -u intercom npm run seed
sudo -u intercom npm run build
```

Installer le service systemd :

```bash
sudo cp /opt/remake-intercom/deploy/systemd/remake-intercom-api.service /etc/systemd/system/remake-intercom-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now remake-intercom-api
sudo systemctl status remake-intercom-api --no-pager
```

## 6. Frontend

```bash
cd /opt/remake-intercom/frontend
sudo -u intercom cp .env.example .env
sudo -u intercom nano .env
```

```env
VITE_API_URL=https://intercom-api.remakemedia.fr
VITE_WS_URL=https://intercom-api.remakemedia.fr
```

Build :

```bash
cd /opt/remake-intercom/frontend
sudo -u intercom npm ci
sudo -u intercom npm run build
```

## 7. LiveKit

Installer Docker si nécessaire :

```bash
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
```

Configurer le secret LiveKit :

```bash
cd /opt/remake-intercom/deploy/livekit
sudo nano livekit.yaml
```

Dans `livekit.yaml`, remplace :

```yaml
keys:
  devkey: "CHANGE_ME_LIVEKIT_SECRET"
```

Le secret doit être exactement le même que `LIVEKIT_API_SECRET` dans `backend/.env`.

Démarrer LiveKit :

```bash
cd /opt/remake-intercom/deploy/livekit
sudo docker compose -f docker-compose.livekit.yml up -d
sudo docker ps
```

## 8. Nginx

Copier les configs :

```bash
sudo cp /opt/remake-intercom/deploy/nginx/intercom.remakemedia.fr.conf /etc/nginx/sites-available/
sudo cp /opt/remake-intercom/deploy/nginx/intercom-api.remakemedia.fr.conf /etc/nginx/sites-available/
sudo cp /opt/remake-intercom/deploy/nginx/intercom-livekit.remakemedia.fr.conf /etc/nginx/sites-available/

sudo ln -s /etc/nginx/sites-available/intercom.remakemedia.fr.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/intercom-api.remakemedia.fr.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/intercom-livekit.remakemedia.fr.conf /etc/nginx/sites-enabled/

sudo nginx -t
sudo systemctl reload nginx
```

## 9. HTTPS Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx \
  -d intercom.remakemedia.fr \
  -d intercom-api.remakemedia.fr \
  -d intercom-livekit.remakemedia.fr
```

Tester le renouvellement :

```bash
sudo certbot renew --dry-run
```

## 10. Firewall

Avec UFW :

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 7881/tcp
sudo ufw allow 50000:50100/udp
sudo ufw enable
sudo ufw status verbose
```

Ne pas ouvrir MySQL publiquement.

## 11. Vérifications

API :

```bash
curl https://intercom-api.remakemedia.fr/health
```

Logs backend :

```bash
sudo journalctl -u remake-intercom-api -f
```

Logs LiveKit :

```bash
cd /opt/remake-intercom/deploy/livekit
sudo docker compose -f docker-compose.livekit.yml logs -f
```

Frontend :

```text
https://intercom.remakemedia.fr
```

Compte admin seed :

```text
admin@remakemedia.fr
ChangeMeNow!123
```

Change ce mot de passe après le premier déploiement.
