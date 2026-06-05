# Meetup Scraper — Extension Chrome

Une extension Chrome qui extrait la liste des **participants aux événements passés** d'un groupe Meetup et l'exporte en fichier **CSV**.

> Compatible Manifest V3 · Testé sur Chrome / Chromium 2025-2026

---

## Ce que fait l'extension

Pour chaque événement passé visible sur la page d'un groupe Meetup, l'extension :

1. Détecte automatiquement tous les **IDs d'événements** présents dans la page.
2. Appelle l'**API GraphQL interne de Meetup** (`/gql2`) pour récupérer la liste complète des participants à chaque événement (avec pagination automatique, 100 participants par page).
3. Gère les erreurs et les limites de taux (`429 Too Many Requests`) avec une logique de retry exponentielle.
4. Exporte toutes les données en un seul fichier **CSV téléchargé automatiquement**.

### Colonnes exportées dans le CSV

| Colonne | Description |
|---|---|
| `eventId` | Identifiant numérique de l'événement Meetup |
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

### Étape 1 — Télécharger le dossier

Clonez le dépôt ou téléchargez le ZIP via le bouton **Code → Download ZIP** sur GitHub.

```bash
git clone https://github.com/<votre-compte>/MeetupScraper.git
```

Si vous avez téléchargé un ZIP, décompressez-le dans un dossier de votre choix.

### Étape 2 — Activer le mode développeur dans Chrome

1. Ouvrez Chrome et rendez-vous à l'adresse : `chrome://extensions/`
2. En haut à droite, activez le bouton **"Mode développeur"** (Developer mode).

![Mode développeur](https://developer.chrome.com/static/docs/extensions/get-started/tutorial/hello-world/image/toggle-developer-mode-1.png)

### Étape 3 — Charger l'extension

1. Cliquez sur le bouton **"Charger l'extension non empaquetée"** (Load unpacked) qui est apparu en haut à gauche.
2. Dans le sélecteur de fichiers, naviguez jusqu'au dossier `MeetupScraper` que vous venez de télécharger (celui qui contient le fichier `manifest.json`).
3. Cliquez sur **Sélectionner**.

L'extension apparaît maintenant dans votre liste d'extensions avec le nom **"Meetup Scraper 2026"**. Elle est prête.

> **Conseil** : Épinglez l'extension à la barre d'outils via l'icône 🧩 Extensions pour y accéder facilement.

---

## Utilisation

### Étape 1 — Se connecter à Meetup

Assurez-vous d'être **connecté à votre compte Meetup** dans le même navigateur. L'extension utilise votre session active pour interroger l'API.

### Étape 2 — Naviguer vers la page des événements passés

Rendez-vous sur la page des **événements passés** du groupe qui vous intéresse :

```
https://www.meetup.com/[nom-du-groupe]/events/past/
```

Exemple :
```
https://www.meetup.com/paris-js/events/past/
```

### Étape 3 — Charger TOUS les événements (scroll)

La page des événements passés utilise un **chargement progressif** (infinite scroll). Pour que l'extension détecte tous les événements, vous devez faire défiler la page jusqu'en bas afin que Meetup charge l'ensemble des événements souhaités.

> Plus vous scrollez, plus l'extension trouvera d'événements à analyser. Arrêtez de scroller quand vous avez chargé la période qui vous intéresse.

### Étape 4 — Lancer l'extraction

1. Cliquez sur l'icône de l'extension dans la barre d'outils Chrome.
2. Dans le popup, cliquez sur le bouton **"Lancer l'extraction"**.
3. Le popup se ferme et un panneau de suivi apparaît en haut à droite de la page avec une barre de progression.

### Étape 5 — Téléchargement automatique du CSV

Une fois tous les événements traités, le fichier CSV est **téléchargé automatiquement** dans votre dossier de téléchargements. Le nom du fichier suit le format :

```
meetup_[nom-du-groupe]_enriched_[date].csv
```

Exemple : `meetup_paris-js_enriched_2026-06-05.csv`

---

## Interface de progression

Pendant l'extraction, un panneau flottant s'affiche :

- **Barre de progression** : avancement global (détection des IDs → récupération des participants → génération du CSV)
- **Bouton Pause / Resume** : met l'extraction en pause à tout moment
- **Bouton ✕** : annule et ferme le panneau
- **Détails** : indique l'événement en cours de traitement et le nombre de participants récupérés

---

## Structure des fichiers

```
MeetupScraper/
├── manifest.json     # Configuration de l'extension (Manifest V3)
├── popup.html        # Interface du bouton d'activation
├── popup.js          # Gestion du clic → envoi du message à content.js
├── content.js        # Logique principale : scraping, appels API, export CSV
├── icon16.png        # Icône 16×16
├── icon32.png        # Icône 32×32
└── icon192.png       # Icône 192×192
```

---

## Fonctionnement technique

```
[Utilisateur clique]
        │
        ▼
   popup.js  ──── chrome.tabs.sendMessage ────▶  content.js
                                                      │
                                              getGroupUrlname()
                                              extractEventIds()
                                                      │
                                              Pour chaque eventId :
                                              fetchAttendees()
                                               └─ POST /gql2
                                                  (pagination cursor)
                                                      │
                                              Génération CSV
                                              Blob → <a>.click()
                                                      │
                                              Téléchargement auto
```

L'extension intercepte également les requêtes vers **Sentry / analytics** pour éviter que le scraping soit signalé côté Meetup.

---

## Limitations connues

- Vous devez être **connecté** à Meetup pour que les appels GraphQL fonctionnent (la session est utilisée via `credentials: 'include'`).
- Meetup peut limiter les requêtes (`429`). L'extension gère cela avec un retry automatique mais un scraping de très grand nombre d'événements peut prendre du temps.
- Seuls les événements **visibles dans la page** (après votre scroll) sont détectés. Les événements non chargés ne seront pas inclus.
- L'extension ne fonctionne que sur `meetup.com`.

---

## Licence

MIT — libre d'utilisation, de modification et de distribution.
