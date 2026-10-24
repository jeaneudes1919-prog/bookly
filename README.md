# Bookly

Place de marché de réservation de services au Bénin : coiffure, beauté, spa, coaching, santé et auto. Les clients explorent les prestataires, réservent un créneau réellement disponible et laissent un avis. Les prestataires gèrent leur entreprise, leurs services, leur équipe, leurs horaires, leurs congés et leur planning. Un administrateur valide les entreprises et modère les comptes.

**Stack** : React 18 + Vite 5 + Tailwind CSS + Framer Motion + Recharts · Node.js 20 + Express 4 + SQLite (better-sqlite3) + node-cron · JWT access token + refresh token httpOnly avec rotation.

## Captures prévues
Les captures seront ajoutées dans `docs/screenshots/` : accueil, explorateur, assistant de réservation, planning hebdomadaire, espace avis et administration.

## Fonctionnalités

### Public
- Accueil avec recherche flottante, catégories, prestataires populaires et avis mis en avant.
- Explorateur filtrable par catégorie, ville, note minimale, budget, avec tri par note, prix ou nouveauté.
- Page prestataire : services, équipe, horaires, avis et réponses du prestataire.
- Assistant de réservation en 4 étapes : service → professionnel → date et heure → confirmation.
- Moteur de disponibilité : horaires, pauses, congés, réservations existantes, préavis d'une heure, fusion des créneaux par membre.
- Favoris animés et confettis de confirmation.

### Client
- Inscription / connexion, profil modifiable.
- Mes réservations : à venir, passées, annulées ; annulation gratuite jusqu'à 24 h avant.
- Avis avec étoiles, uniquement après une réservation terminée et une seule fois.
- Favoris et centre de notifications avec compteur et rappels.

### Prestataire
- Tableau de bord : revenus, réservations, annulations, no-shows, services populaires, nouveaux vs récurrents.
- Planning hebdomadaire en grille, navigation par semaine, filtre par membre, détail et changement de statut.
- Services, équipe, services assurés, horaires par jour avec plusieurs plages, congés.
- Réservation manuelle téléphonique avec création automatique du client si nécessaire.
- Avis clients et réponses publiques.
- Onboarding entreprise en attente de validation admin.

### Administrateur
- Statistiques globales, validation/suspension des prestataires.
- Gestion des utilisateurs : rôle et blocage/réactivation.

## Architecture

```text
bookly/
├── client/                 React + Vite
│   ├── src/
│   │   ├── App.jsx         routes, navigation, Guard
│   │   ├── pub.jsx         accueil, explorateur, page prestataire, réservation
│   │   ├── me.jsx          auth, mes réservations
│   │   ├── pro.jsx         tableau de bord, planning, services, équipe, admin
│   │   ├── pro-extra.jsx   avis, congés, réservation manuelle, utilisateurs
│   │   ├── community.jsx   favoris, notifications, profil
│   │   ├── auth.jsx        contexte utilisateur + favoris
│   │   └── ui.jsx          design system
│   └── __tests__/          tests Vitest + Testing Library
└── server/
    ├── src/
    │   ├── app.js          Express, CORS, erreurs
    │   ├── auth.js         JWT, refresh token, rôles
    │   ├── api.js          routes publiques, client et prestataire
    │   ├── extra.js        favoris, notifications, congés, avis, admin
    │   ├── avail.js        computeSlots (fonction pure)
    │   ├── jobs.js         node-cron : completed + rappels 24 h
    │   ├── db.js           schéma SQLite + migrations
    │   └── seed.js         jeu de données de démonstration
    ├── tests/              tests Vitest + Supertest
    └── scripts/smoke.sh    smoke test curl
```

## Prérequis
- Node.js 20 ou supérieur
- npm
- Aucun service externe : SQLite est embarqué, les e-mails sont simulés dans `emails_outbox`.

## Installation et lancement

```bash
npm install
npm run setup          # installe aussi server/ et client/
npm run seed           # réinitialise et remplit la base
npm run dev            # API :4000 + client :5173
```

Le client est sur `http://localhost:5173`, l'API sur `http://localhost:4000`.

Variables serveur disponibles dans `server/.env.example` :

```bash
NODE_ENV=development
PORT=4000
JWT_SECRET=change-me-en-production
CLIENT_URL=http://localhost:5173
DB_FILE=data/bookly.db
```

## Comptes de démonstration
Mot de passe commun : **`Bookly2026!`**

| Rôle | Email |
| --- | --- |
| Client principal | `client@bookly.dev` |
| Prestataire principal | `owner@bookly.dev` |
| Administrateur | `admin@bookly.dev` |

Le seed crée 15 clients, 8 prestataires approuvés, 1 prestataire en attente, 143 réservations, 60 avis, des favoris, des congés et des notifications.

## API principale (préfixe `/api`)

### Auth
`POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/me`

### Public
`GET /meta`, `GET /businesses`, `GET /businesses/:slug`, `GET /businesses/:id/reviews`, `GET /businesses/:id/availability`, `GET /reviews/featured`

### Client
`POST /bookings`, `GET /bookings/mine`, `GET /bookings/:id`, `POST /bookings/:id/cancel`, `POST /bookings/:id/review`
`GET /favorites`, `POST /favorites/:businessId`, `DELETE /favorites/:businessId`
`GET /notifications`, `POST /notifications/read-all`, `PATCH /notifications/:id/read`

### Prestataire
`GET/POST/PATCH /owner/business`, `GET/POST/PATCH/DELETE /owner/services`
`GET/POST/PUT/DELETE /owner/staff`, `PUT /owner/staff/:id/services`, `PUT /owner/staff/:id/working-hours`
`GET/POST/DELETE /owner/staff/:id/time-off`
`GET /owner/bookings`, `POST /owner/bookings`, `PATCH /owner/bookings/:id/status`
`GET /owner/stats`, `GET /owner/reviews`, `POST /owner/reviews/:id/reply`

### Admin
`GET /admin/stats`, `GET /admin/businesses`, `PATCH /admin/businesses/:id/status`
`GET /admin/users`, `PATCH /admin/users/:id/role-or-block`

Les listes renvoient `{ data, meta }` lorsque la pagination s'applique. Les erreurs utilisent `{ error: { code, message } }`.

## Moteur de disponibilité
`server/src/avail.js` expose une fonction pure `computeSlots` :

```js
computeSlots({
  date: "2026-11-02",
  service: {duration_min: 45},
  staffList: [{id, workingHours, timeOff, bookings}],
  now: "2026-11-02T09:00",
  stepMin: 15,
  lead: 60
});
```

La création d'une réservation revérifie le créneau dans une transaction SQLite. En cas de conflit, l'API renvoie `409 CONFLICT`. L'annulation client est refusée à moins de 24 h. Le prestataire peut annuler à tout moment et le client reçoit une notification.

## Tâches planifiées
`server/src/jobs.js` démarre deux tâches `node-cron` hors tests :
- chaque minute : les réservations confirmées dont la fin est passée deviennent `completed` ;
- chaque heure : notification + e-mail simulé pour les réservations à venir dans les 24 h, avec la colonne `reminded`.

## Tests

```bash
npm test               # serveur + client
npm run build          # build client de production
npm run smoke          # smoke test contre l'API sur :4000
```

- **Serveur** : 17 tests Vitest + Supertest (computeSlots, double réservation, règle des 24 h, avis, rôles, isolation propriétaire, job, congés, réservation manuelle, favoris, notifications, réponses aux avis).
- **Client** : 11 tests Vitest + Testing Library (formatters, étoiles, statuts, état vide, connexion, Guard).
- Le smoke test couvre login, exploration, disponibilité, réservation, annulation et espace prestataire.

## Structure des données
Tables : `users`, `refresh_tokens`, `businesses`, `services`, `staff`, `staff_services`, `working_hours`, `time_off`, `bookings`, `reviews`, `favorites`, `notifications`, `emails_outbox`.

## Décisions techniques
- SQLite + better-sqlite3 pour un déploiement simple et transactionnel, sans ORM.
- Refresh token stocké haché, rotation à chaque refresh, cookie `httpOnly` SameSite Lax.
- Disponibilité calculée côté serveur à partir des données réelles, jamais confiée au client.
- E-mails simulés dans une table pour garder le projet autonome.
- Calendrier hebdomadaire et sélecteur de créneaux codés à la main, sans librairie de calendrier.

## Limites connues
- Paiement en ligne non implémenté (hors périmètre).
- E-mails/SMS réels non branchés.
- Réinitialisation de mot de passe à ajouter (voir `README_PERSO.md`).
- Migration progressive vers React Query et découpage plus fin de l'API (voir `README_PERSO.md`).
