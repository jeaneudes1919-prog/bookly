# Notes personnelles — Bookly

## Ce qui est déjà en place
Le socle complet est fonctionnel : auth avec rotation du refresh token, moteur de disponibilité testé, réservation transactionnelle, annulation 24 h, planning hebdomadaire, services/équipe/horaires, congés, favoris, notifications, rappels node-cron, avis + réponses, réservation manuelle, administration des utilisateurs, seed riche et tests serveur/client.

## 8 exercices pour s'entraîner

1. **Réinitialisation de mot de passe** — ajouter `password_reset_tokens`, les routes `POST /auth/forgot-password` et `POST /auth/reset-password`, puis un écran dédié. Utiliser un token haché et une expiration de 30 minutes.
2. **React Query** — installer `@tanstack/react-query`, remplacer progressivement les `useEffect` de chargement par `useQuery`/`useMutation`, avec invalidation après réservation, favori et changement de statut. Commencer par `community.jsx` et `pro-extra.jsx`.
3. **Découper l'API** — extraire `server/src/api.js` en modules `businesses`, `bookings`, `owner`, `admin`, avec un routeur par feature et des services partagés. Objectif : aucun fichier de route ne dépasse 150 lignes.
4. **Pagination côté client** — ajouter un composant `Pagination` et l'utiliser sur l'explorateur et les avis. Le serveur renvoie déjà `meta.page`, `meta.limit` et `meta.total`.
5. **Upload de photo de profil** — ajouter `multer`, un dossier `uploads/`, un endpoint `POST /auth/avatar`, puis un composant `Avatar` avec repli en initiales.
6. **Créneaux partiels** — faire évoluer `computeSlots` pour gérer les congés sur une demi-journée (`time_off` avec heures) et les pauses multiples. Ajouter les tests correspondants.
7. **Notifications temps réel** — remplacer le polling de 30 s par Socket.IO, avec une room par utilisateur. Garder les notifications en base pour l'historique.
8. **Tests E2E** — ajouter Playwright et scénariser : login client, réservation, annulation, login prestataire, réponse à un avis. Réutiliser les comptes du seed.

## Concepts clés et fichiers à relire

- **Disponibilité** : `server/src/avail.js` — fonction pure, aucune dépendance à Express ou SQLite. Elle prend les horaires, congés et réservations déjà chargés. C'est le bon endroit pour tester les règles métier.
- **Transaction SQLite** : `server/src/api.js` (`POST /bookings`) et `server/src/extra.js` (`POST /owner/bookings`). La vérification du créneau et l'insertion sont dans le même `db.transaction`.
- **Refresh token** : `server/src/auth.js`. Le token brut part dans le cookie, seul son SHA-256 est stocké. Chaque refresh révoque l'ancien token et en émet un nouveau.
- **Guards de rôle** : `Guard` dans `client/src/App.jsx`, `role()` dans `server/src/auth.js`. Toujours vérifier côté serveur, même si le bouton est caché côté client.
- **Planning CSS** : composant `Planning` dans `client/src/pro.jsx`. Les blocs sont positionnés avec `top` et `height` calculés à partir de l'heure et de la durée, pas avec une librairie de calendrier.
- **Rappels** : `server/src/jobs.js`. La colonne `bookings.reminded` évite les doublons. Les e-mails sont écrits dans `emails_outbox` pour rester autonome.
- **Favoris optimistes** : `client/src/auth.jsx`. L'état local est modifié immédiatement puis rollback en cas d'erreur API.

## Pièges fréquents

- Les dates métier sont des chaînes locales `YYYY-MM-DDTHH:mm` en UTC+1, pas des objets `Date` sérialisés. Ne pas mélanger avec `toISOString()` sans convertir.
- Le préavis de 60 minutes s'applique uniquement au jour courant. Vérifier `now.slice(0,10)` avant de comparer les heures.
- Une réservation `pending` ou `confirmed` bloque un créneau ; `cancelled`, `completed` et `no_show` ne le bloquent pas.
- Le rating d'une entreprise doit être recalculé après chaque avis, jamais incrémenté à la main.
- Un client ne peut laisser qu'un avis par réservation : contrainte `UNIQUE` sur `reviews.booking_id`.
- Les routes publiques doivent être montées avant le middleware `auth` global du routeur, sinon elles renvoient 401.
- Le cookie `rt` est limité au chemin `/api/auth` : le navigateur ne l'envoie pas aux autres routes, c'est volontaire.
- Le seed supprime les tables dans un ordre compatible avec les clés étrangères. Ajouter une nouvelle table impose de mettre à jour cet ordre.

## Décisions techniques

- **Pas d'ORM** : better-sqlite3 + SQL préparé, requêtes paramétrées. Plus simple à auditer et très rapide pour ce volume.
- **Fonction pure pour les créneaux** : permet de tester les règles sans HTTP ni base. Le routeur ne fait que charger les données et appeler `computeSlots`.
- **E-mails simulés** : `emails_outbox` + console. Aucun SMTP à configurer pour la démo.
- **Réservation manuelle** : crée un utilisateur `client` avec un email interne si le téléphone est inconnu, pour conserver une clé étrangère valide.
- **Pas de calendrier externe** : la grille est en CSS, ce qui évite une dépendance lourde et donne un rendu sur mesure.
- **React Query non généralisé** : le projet fonctionne avec des appels directs et un polling simple. La migration est un exercice, pas un blocage fonctionnel.

## Blocages contournés

- L'installation de `node-cron` a échoué une première fois pour un timeout réseau ; une seconde installation a réussi.
- `node-cron` est démarré uniquement hors environnement de test pour éviter les tâches de fond pendant Vitest.
- La base de démonstration est créée automatiquement au premier démarrage du serveur si la table `users` est vide.
- Le build client dépasse légèrement 500 kB : Recharts et Framer Motion sont les principaux contributeurs. Une piste est le chargement différé des pages pro/admin.
