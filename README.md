# Remake Intercom

Application d'administration d'intercom de production basée sur Mumble/Murmur.

Architecture cible :

```text
Frontend React/Vite
  app.remakemedia.fr
        |
Backend Express TypeScript API + WebSocket
  api.remakemedia.fr
        |
MySQL/MariaDB = source propre de configuration
        |
Mumble Server / Murmur = moteur audio réel
  mumble.remakemedia.fr:64738 TCP/UDP
```

Le dashboard web ne transporte pas l'audio. L'audio reste géré par Mumble/Murmur. Le backend stocke la configuration dans MySQL, expose une API REST, diffuse les événements live via WebSocket, puis applique les ACL et actions live à Murmur via une couche `MurmurService`.

## Structure

```text
.
├── backend
│   ├── prisma/schema.prisma
│   ├── prisma/seed.ts
│   └── src
│       ├── routes
│       ├── services
│       ├── middleware
│       └── config
├── frontend
│   └── src
│       ├── api
│       ├── components
│       ├── pages
│       └── styles
└── docker-compose.yml
```

## Choix techniques

- Frontend : React + Vite + TypeScript, thème sombre dashboard, matrices scrollables, WebSocket Socket.IO.
- Backend : Express + TypeScript, Prisma, MySQL, JWT admin, argon2, rate limit login, audit logs.
- Temps réel : Socket.IO pour les événements `permissions.modified`, `sync.completed`, `sync.error`.
- Murmur : abstraction `MurmurService`, implémentation `IceMurmurService` prête comme point d'extension.

Note importante : l'écosystème Node pour ZeroC Ice/Murmur varie selon les versions système. Le projet isole donc l'intégration dans [backend/src/services/MurmurService.ts](./backend/src/services/MurmurService.ts). La base compile et tourne sans Murmur, puis il faut compléter cet adaptateur avec un binding Ice Node compatible ou un sidecar local Python/PHP/Go exposant les appels Murmur.

## DNS conseillé

Zone DNS `remakemedia.fr` :

```text
@                     A      <IP_VPS>
app                   A      <IP_VPS>
api                   A      <IP_VPS>
mumble                A      <IP_VPS>
admin                 CNAME  app.remakemedia.fr.   # optionnel
```

Option IPv6 si disponible :

```text
@                     AAAA   <IPv6_VPS>
app                   AAAA   <IPv6_VPS>
api                   AAAA   <IPv6_VPS>
mumble                AAAA   <IPv6_VPS>
```

Séparation recommandée :

- `app.remakemedia.fr` : frontend admin.
- `api.remakemedia.fr` : API REST + WebSocket.
- `mumble.remakemedia.fr` : serveur Mumble public sur `64738/tcp` et `64738/udp`.
- `admin.remakemedia.fr` : optionnel. Pour un projet interne, un alias vers `app` suffit. Sépare-le seulement si tu veux plus tard isoler une zone d'administration avec SSO, VPN ou allowlist IP.

## Routes API

Toutes les routes sauf `/auth/login`, `/auth/me` et `/health` nécessitent `Authorization: Bearer <jwt>`.

```text
POST   /auth/login
GET    /auth/me
GET    /users
POST   /users
PATCH  /users/:id
DELETE /users/:id
GET    /roles
POST   /roles
PATCH  /roles/:id
DELETE /roles/:id
GET    /rooms
POST   /rooms
PATCH  /rooms/:id
DELETE /rooms/:id
GET    /permissions/matrix
PATCH  /permissions/matrix
GET    /overrides
PATCH  /overrides
POST   /sync/murmur
GET    /murmur/status
GET    /murmur/users
GET    /murmur/channels
POST   /murmur/users/:id/mute
POST   /murmur/users/:id/deafen
POST   /murmur/users/:id/move
GET    /logs
GET    /presets
POST   /presets
POST   /presets/:id/apply
```

## Lancement local

Prérequis :

- Node.js 20+ ou 22+
- Docker Desktop, ou MySQL/MariaDB local

Créer les fichiers d'environnement :

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Démarrer MySQL avec Docker :

```bash
docker compose up -d mysql
```

Installer et préparer le backend :

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run seed
npm run dev
```

Installer et lancer le frontend :

```bash
cd frontend
npm install
npm run dev
```

URLs locales :

- Frontend : `http://localhost:5173`
- Backend : `http://localhost:4000`
- Healthcheck : `http://localhost:4000/health`

Compte seed par défaut :

```text
admin@remakemedia.fr
ChangeMeNow!123
```

Change ce mot de passe immédiatement en production.

## Variables d'environnement backend

```bash
NODE_ENV=production
PORT=4000
DATABASE_URL="mysql://intercom:mot_de_passe@127.0.0.1:3306/remake_intercom"
JWT_SECRET="long-secret-random"
JWT_EXPIRES_IN="12h"
CORS_ORIGIN="https://app.remakemedia.fr,https://admin.remakemedia.fr"
MURMUR_HOST="127.0.0.1"
MURMUR_ICE_PORT=6502
MURMUR_ICE_SECRET_READ=""
MURMUR_ICE_SECRET_WRITE=""
MURMUR_VIRTUAL_SERVER_ID=1
MUMBLE_PUBLIC_HOST="mumble.remakemedia.fr"
MUMBLE_PUBLIC_PORT=64738
```

## Variables d'environnement frontend

```bash
VITE_API_URL=https://api.remakemedia.fr
VITE_WS_URL=https://api.remakemedia.fr
```

## Installation MySQL ou MariaDB sur Ubuntu

Option MySQL :

```bash
sudo apt update
sudo apt install -y mysql-server
sudo systemctl enable --now mysql
sudo mysql_secure_installation
```

Créer la base et l'utilisateur :

```bash
sudo mysql
```

```sql
CREATE DATABASE remake_intercom CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'intercom'@'localhost' IDENTIFIED BY 'CHANGE_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON remake_intercom.* TO 'intercom'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Option MariaDB :

```bash
sudo apt update
sudo apt install -y mariadb-server
sudo systemctl enable --now mariadb
sudo mysql_secure_installation
```

La même commande SQL fonctionne avec MariaDB.

## Installation Mumble/Murmur sur Ubuntu

Vérification actuelle des paquets : sur Ubuntu 24.04 et 26.04, le paquet serveur est `mumble-server` dans Universe. Le nom amont historique est Murmur, mais sur Debian/Ubuntu le paquet serveur s'appelle `mumble-server`. La documentation Mumble actuelle indique aussi que la configuration serveur moderne est `mumble-server.ini`, et l'interface Ice écoute typiquement sur `127.0.0.1:6502`.

Activer Universe si besoin :

```bash
sudo add-apt-repository universe
sudo apt update
```

Installer le serveur :

```bash
sudo apt install -y mumble-server
```

Configurer le paquet si l'assistant est disponible :

```bash
sudo dpkg-reconfigure mumble-server
```

Répondre généralement :

- autostart : yes
- priority : selon besoin
- SuperUser password : définir un mot de passe fort

Si tu dois définir ou changer le mot de passe `SuperUser` :

```bash
sudo murmurd -ini /etc/mumble-server.ini -supw 'CHANGE_SUPERUSER_PASSWORD'
```

Selon la version Ubuntu, le binaire peut être `mumble-server` plutôt que `murmurd`. Vérifie avec :

```bash
command -v murmurd || command -v mumble-server
```

Fichier de configuration Debian/Ubuntu le plus courant :

```bash
sudo nano /etc/mumble-server.ini
```

Si ce fichier n'existe pas sur une image récente, cherche le chemin installé :

```bash
dpkg -L mumble-server | grep -E 'mumble-server\.ini|murmur\.ini'
```

Réglages recommandés :

```ini
welcometext="<br />Remake Media Intercom"
port=64738
serverpassword=
registerName=Remake Media Intercom
users=100
ice="tcp -h 127.0.0.1 -p 6502"
icesecretread=CHANGE_READ_SECRET
icesecretwrite=CHANGE_WRITE_SECRET
```

Garde Ice lié à `127.0.0.1`. Ne l'expose pas publiquement.

Activer et redémarrer :

```bash
sudo systemctl enable --now mumble-server
sudo systemctl restart mumble-server
```

Vérifier le service :

```bash
systemctl status mumble-server --no-pager
journalctl -u mumble-server -n 100 --no-pager
```

Vérifier le port Mumble :

```bash
sudo ss -lntup | grep 64738
```

Vérifier Ice :

```bash
sudo ss -lntp | grep 6502
```

Test client :

1. Installe le client Mumble sur ton poste.
2. Ajoute un serveur `mumble.remakemedia.fr`, port `64738`.
3. Connecte-toi en `SuperUser` pour vérifier l'administration.
4. Crée quelques channels côté Mumble, puis renseigne leurs IDs dans les salons du dashboard.

## Activer Ice côté application

Le projet expose les variables :

```bash
MURMUR_HOST=127.0.0.1
MURMUR_ICE_PORT=6502
MURMUR_ICE_SECRET_READ=CHANGE_READ_SECRET
MURMUR_ICE_SECRET_WRITE=CHANGE_WRITE_SECRET
```

Implémentation à compléter :

- `status()` : connexion au Meta Ice.
- `users()` : lire les états des sessions.
- `channels()` : lire les channels Murmur.
- `mute()`, `deafen()`, `move()` : appliquer les actions live.
- `applyAcl()` : convertir la matrice DB en ACL Murmur.

Pour une base de production robuste, je recommande un sidecar local Python utilisant les bindings ZeroC Ice disponibles sur la distribution, puis `IceMurmurService` appelle ce sidecar sur `127.0.0.1` via HTTP ou Unix socket. Cela évite de bloquer le backend Node sur la disponibilité d'un binding Ice natif.

## Traduction permissions vers Murmur

La base garde les niveaux métier :

```text
inherit, none, listen, talk_ptt, duplex, admin, move, mute, deafen, whisper
```

Mapping recommandé vers ACL Murmur :

```text
none      -> deny Traverse, Enter, Speak
listen    -> allow Traverse, Enter ; deny Speak
talk_ptt  -> allow Traverse, Enter, Speak ; PTT reste une convention client/rôle
duplex    -> allow Traverse, Enter, Speak
admin     -> allow Traverse, Enter, Speak, MakeChannel, LinkChannel, Register, Move, MuteDeafen
move      -> allow Move
mute      -> allow MuteDeafen
deafen    -> allow MuteDeafen
whisper   -> allow Whisper
inherit   -> ne pose pas de règle explicite
```

À garder en tête : Mumble ne force pas directement le push-to-talk côté serveur comme une permission ACL universelle. `talk_ptt` est donc une règle métier que tu peux compléter par conventions client, certificats, groupes ou channels dédiés.

## Déploiement VPS Ubuntu

Installer Node.js via NodeSource ou `nvm`. Exemple NodeSource 22 :

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs build-essential
node -v
npm -v
```

Créer un utilisateur applicatif :

```bash
sudo adduser --system --group --home /opt/remake-intercom intercom
sudo mkdir -p /opt/remake-intercom
sudo chown -R intercom:intercom /opt/remake-intercom
```

Copier le projet dans `/opt/remake-intercom`, puis :

```bash
cd /opt/remake-intercom/backend
npm ci
npm run prisma:generate
npm run prisma:deploy
npm run seed
npm run build

cd /opt/remake-intercom/frontend
npm ci
npm run build
```

Service systemd backend :

```bash
sudo nano /etc/systemd/system/remake-intercom-api.service
```

```ini
[Unit]
Description=Remake Intercom API
After=network.target mysql.service

[Service]
Type=simple
User=intercom
Group=intercom
WorkingDirectory=/opt/remake-intercom/backend
EnvironmentFile=/opt/remake-intercom/backend/.env
ExecStart=/usr/bin/node dist/src/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Activer :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now remake-intercom-api
sudo systemctl status remake-intercom-api --no-pager
```

## Nginx

Installer :

```bash
sudo apt install -y nginx
```

Configuration `api.remakemedia.fr` :

```bash
sudo nano /etc/nginx/sites-available/api.remakemedia.fr
```

```nginx
server {
    listen 80;
    server_name api.remakemedia.fr;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Configuration `app.remakemedia.fr` :

```bash
sudo nano /etc/nginx/sites-available/app.remakemedia.fr
```

```nginx
server {
    listen 80;
    server_name app.remakemedia.fr admin.remakemedia.fr;
    root /opt/remake-intercom/frontend/dist;
    index index.html;

    location / {
        try_files $uri /index.html;
    }
}
```

Activer :

```bash
sudo ln -s /etc/nginx/sites-available/api.remakemedia.fr /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/app.remakemedia.fr /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

`mumble.remakemedia.fr` n'a pas besoin de reverse proxy Nginx pour l'audio Mumble. Le client Mumble se connecte directement au port `64738` TCP/UDP.

## Certbot HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app.remakemedia.fr -d admin.remakemedia.fr
sudo certbot --nginx -d api.remakemedia.fr
sudo certbot renew --dry-run
```

Pour Mumble, le chiffrement audio est géré par Mumble. Tu peux configurer un certificat dans `mumble-server.ini` si tu veux éviter les avertissements client, mais ce n'est pas via Nginx/Certbot HTTP.

## Firewall

Avec UFW :

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 64738/tcp
sudo ufw allow 64738/udp
sudo ufw enable
sudo ufw status verbose
```

Ne pas ouvrir `6502/tcp` publiquement. Ice doit rester local ou strictement filtré.

## Sources vérifiées pour Murmur/Ubuntu

- Paquet Ubuntu `mumble-server` pour 26.04 : https://www.ubuntuupdates.org/package/core/resolute/universe/base/mumble-server
- Paquet/source Ubuntu Mumble 26.04 : https://launchpad.net/ubuntu/resolute/+source/mumble
- Documentation officielle Mumble, configuration serveur et Ice : https://www.mumble.info/documentation/administration/config-file/
- Documentation officielle Mumble, scripting Ice : https://www.mumble.info/documentation/mumble-server/scripting/ice/

