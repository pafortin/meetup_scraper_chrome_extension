# Meetup Scraper — Extension Chrome

Une extension Chrome qui récupère **tous les événements passés** d'un groupe Meetup et exporte la liste **enrichie de leurs participants** en fichier **CSV**.

> Compatible Manifest V3 · Testé sur Chrome / Chromium 2025-2026

---

## Ce que fait l'extension

Depuis n'importe quelle page d'un groupe Meetup, l'extension :

1. Détecte automatiquement le **groupe** (`urlname`) via les données de la page (`__NEXT_DATA__`), le lien canonique ou l'URL.
2. Récupère **tous les événements passés** du groupe en appelant l'**API GraphQL interne de Meetup** (`/gql2`, requête `groupByUrlname`) — avec pagination automatique. **Aucun scroll manuel nécessaire.**
3. Pour chaque événement, récupère la **liste complète des participants** (`getAttendees`, 100 par page, pagination automatique).
4. Gère les erreurs et les limites de taux (`429 Too Many Requests`) avec un retry exponentiel.
5. Enrichit chaque ligne avec le **titre, la date et la description** de l'événement, et exporte le tout en un **CSV téléchargé automatiquement**.

### Colonnes exportées dans le CSV

| Colonne | Description |
|---|---|
| `eventId` | Identifiant numérique de l'événement Meetup |
| `eventTitle` | Titre de l'événement |
| `eventDate` | Date de l'événement (AAAA-MM-JJ) |
| `eventDescription` | Description de l'événement (nettoyée du HTML, tronquée à 600 caractères) |
| `memberName` | Nom affiché du membre |
| `memberId` | Identifiant unique du membre |
| `status` | Statut RSVP (`YES` ou `ATTENDED`) |
| `guests` | Nombre d'invités accompagnant le membre |
| `eventsAttended` | Nombre total d'événements suivis dans ce groupe |
| `noShowCount` | Nombre de fois où le membre s'est inscrit sans venir |
| `memberRole` | Rôle dans le groupe (`MEMBER`, `ORGANIZER`…) |
| `memberStatus` | Statut du membership (`ACTIVE`, etc.) |
| `isFamiliarFace` | `1` si Meetup le considère comme un habitué, `0` sinon |

---

## Installation (mode développeur)

L'extension n'est pas publiée sur le Chrome Web Store. Il faut l'installer manuellement en **mode développeur**.

### Étape 1 — Récupérer le dossier

Clonez le dépôt ou téléchargez le ZIP (bouton **Code → Download ZIP** sur GitHub), puis décompressez-le.

```bash
git clone https://github.com/pafortin/meetup_scraper_chrome_extension.git
```

### Étape 2 — Activer le mode développeur dans Chrome

1. Ouvrez Chrome à l'adresse : `chrome://extensions/`
2. En haut à droite, activez **« Mode développeur »** (Developer mode).

### Étape 3 — Charger l'extension

1. Cliquez sur **« Charger l'extension non empaquetée »** (Load unpacked).
2. Sélectionnez le dossier qui contient le fichier `manifest.json`.

L'extension apparaît sous le nom **« Meetup Scraper 2026 »**. Épinglez-la à la barre d'outils via l'icône 🧩 pour y accéder facilement.

---

## Utilisation

### Étape 1 — Se connecter à Meetup

Soyez **connecté à votre compte Meetup** dans le même navigateur : l'extension utilise votre session active pour interroger l'API (`credentials: 'include'`).

### Étape 2 — Ouvrir la page du groupe

Rendez-vous sur une page du groupe qui vous intéresse, par exemple sa page d'accueil ou ses événements :

```
https://www.meetup.com/paris-js/
https://www.meetup.com/paris-js/events/past/
```

Pas besoin de scroller : l'extension récupère la liste des événements directement via l'API.

### Étape 3 — Lancer l'extraction

1. Cliquez sur l'icône de l'extension dans la barre d'outils.
2. Cliquez sur **« Lancer l'extraction »**.
3. Un panneau de suivi apparaît en haut à droite de la page avec une barre de progression.

### Étape 4 — Téléchargement automatique du CSV

À la fin, le CSV est **téléchargé automatiquement**. Nom du fichier :

```
meetup_[nom-du-groupe]_enriched_[date].csv
```

Exemple : `meetup_paris-js_enriched_2026-07-18.csv`

---

## Interface de progression

Pendant l'extraction, un panneau flottant s'affiche :

- **Barre de progression** : avancement global (liste des événements → récupération des participants → génération du CSV)
- **Bouton Pause / Resume** : bascule l'état de pause
- **Bouton ✕** : ferme le panneau
- **Détails** : indique l'événement en cours et le nombre de participants récupérés

---

## Structure des fichiers

```
MeetupScraper/
├── manifest.json     # Configuration de l'extension (Manifest V3)
├── popup.html        # Interface du bouton d'activation
├── popup.js          # Au clic : injecte scraper.js dans le monde principal de la page
├── scraper.js        # Logique principale : détection groupe, appels API, export CSV
├── icon16.png        # Icône 16×16
├── icon32.png        # Icône 32×32
└── icon192.png       # Icône 192×192
```

---

## Fonctionnement technique

```
[Utilisateur clique sur l'icône]
        │
        ▼
   popup.js
        │  chrome.scripting.executeScript({ world: 'MAIN', files: ['scraper.js'] })
        ▼
   scraper.js  (exécuté dans le MONDE PRINCIPAL de la page)
        │
   getGroupUrlname()          → __NEXT_DATA__ / canonical / URL
   fetchGroupEvents(urlname)  → POST /gql2 groupByUrlname (tous les events passés, pagination)
        │
   Pour chaque eventId :
   fetchAttendees()           → POST /gql2 getAttendees (pagination cursor)
        │
   Enrichissement (titre, date, description) + génération CSV
   Blob → <a>.click()         → téléchargement automatique
```

L'extension s'exécute dans le **monde principal** de la page (via `executeScript` avec `world: 'MAIN'`), ce qui lui donne accès à `window.__NEXT_DATA__` et au `fetch` authentifié de la page — exactement comme le bookmarklet lancé depuis un favori. Elle neutralise aussi les requêtes vers **Sentry / analytics** pendant l'extraction.

---

## Limitations connues

- Vous devez être **connecté** à Meetup pour que les appels GraphQL fonctionnent.
- Meetup peut limiter les requêtes (`429`). L'extension gère cela avec un retry automatique ; un très grand nombre d'événements peut prendre du temps.
- L'extension ne fonctionne que sur `meetup.com`.

---

## Licence

MIT — libre d'utilisation, de modification et de distribution.
