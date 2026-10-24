# Production — pistes pour plus tard

Rien de ce document n'est implémenté dans le projet. Il sert de feuille de route.

## Hébergement
- **Front** : build statique `client/dist` servi par Nginx, Caddy ou un CDN.
- **API** : Node 20 derrière un reverse proxy HTTPS. SQLite, les uploads et Socket.IO imposent une seule instance avec disque persistant (pas de scale horizontal sans PostgreSQL/Redis).
- **Reverse proxy** : router `/api` et `/socket.io` vers `127.0.0.1:4000`, servir le reste depuis `client/dist`.

Exemple Caddy :

```caddyfile
bookly.example.com {
  root * /var/www/bookly/client/dist
  encode gzip
  @api path /api/* /socket.io/*
  reverse_proxy @api 127.0.0.1:4000
  try_files {path} /index.html
  file_server
}
```

## Variables d'environnement
```bash
NODE_ENV=production
PORT=4000
JWT_SECRET=<secret long et aléatoire>
CLIENT_URL=https://bookly.example.com
DB_FILE=/var/lib/bookly/bookly.db
```

- Passer le cookie refresh en `secure: true` (déjà conditionné à `NODE_ENV=production`).
- Configurer `app.set("trust proxy", 1)` derrière le reverse proxy (déjà fait en production).
- Ne jamais committer `.env`.

## Dockerfile (exemple, non utilisé)
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY client/package*.json client/
RUN npm install --prefix client
COPY client client
RUN npm run build --prefix client

FROM node:20-alpine
WORKDIR /app
COPY server/package*.json server/
RUN npm install --prefix server --omit=dev
COPY server server
COPY --from=build /app/client/dist client/dist
ENV NODE_ENV=production PORT=4000 DB_FILE=/data/bookly.db
VOLUME /data
EXPOSE 4000
CMD ["node", "server/src/server.js"]
```

## CI/CD
1. `npm ci` à la racine, dans `server/` et `client/`.
2. `npm test` puis `npm run build`.
3. Publier l'artefact `client/dist` et l'image serveur.
4. Déployer sur le VPS, redémarrer le service systemd, vérifier `/api/health`.

## Migration SQLite → PostgreSQL
- Remplacer `better-sqlite3` par `pg` ou un ORM (Prisma/Drizzle).
- Adapter les types : `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL`, `TEXT` dates → `timestamptz`.
- Réécrire les transactions synchrones en `BEGIN/COMMIT` asynchrones.
- Ajouter Redis pour les sessions/rooms Socket.IO si plusieurs instances.
- Prévoir un script de migration des données et une période de double écriture.

## Sauvegardes
- Sauvegarder `DB_FILE` et le dossier `uploads/` (si ajouté) toutes les heures.
- Utiliser `sqlite3 .backup` ou `VACUUM INTO` pour un snapshot cohérent.
- Tester la restauration sur un environnement de staging.

## Sécurité
- Rate limiting sur login/register (déjà présent) et éventuellement sur les réservations.
- Journalisation des actions sensibles (changement de rôle, blocage, annulation prestataire).
- Rotation des secrets, expiration courte des access tokens, cookies `secure` + `httpOnly`.
- Valider les uploads (type MIME, taille, antivirus) si l'upload est ajouté.
- En-têtes de sécurité Helmet (déjà présent), CORS limité à `CLIENT_URL`.

## Monitoring
- Healthcheck `/api/health`.
- Logs JSON (morgan ou pino) avec request id.
- Métriques : latence API, taux d'erreur 5xx, taille de la base, nombre de réservations en échec 409.
- Alerte sur les tâches cron (complétion, rappels) si elles ne tournent plus.
