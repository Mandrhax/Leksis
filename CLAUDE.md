# CLAUDE.md — Projet Leksis

## 🎯 Objectif du projet

Leksis est une application de **traduction et de réécriture assistées par IA**, conçue pour être déployée **on‑premise / bare‑metal** chez des clients.

L'objectif est de fournir une **solution tout‑en‑un**, locale et sécurisée, permettant de travailler sur des contenus textuels **sans dépendance cloud**.

---

## ✅ Fonctionnalités couvertes par Leksis

Leksis couvre **exactement quatre grands cas d'usage**.  
Toute évolution du produit doit s'inscrire dans l'un de ces périmètres.

### 1. Traduction de texte

- Traduction de texte libre saisi par l'utilisateur
- Choix de la langue source (avec auto-détection) et cible
- Gestion du ton si la source est anglaise (tu/vous — Informal/Formal)
- Résultat modifiable et réutilisable
- Swap source ↔ target avec re-traduction automatique

---

### 2. Traduction de documents

Leksis permet la **traduction de fichiers complets**, avec extraction du texte, traduction, puis restitution.

Formats supportés :
- PDF
- DOCX
- TXT
- CSV

Règles importantes :
- Le texte est **extrait côté serveur**
- La traduction est effectuée par l'IA via le Gateway
- Le document traduit conserve autant que possible la structure originale (headings, tables, paragraphes)
- Séparateur `|||` pour la traduction structurée par segments

---

### 3. Extraction de texte depuis une image (OCR) et traduction

- Extraction de texte depuis une image via Ollama vision
- Affichage du texte extrait avec stats (langue détectée, nombre de mots)
- Traduction possible du texte extrait (mode "Extract & translate")

Cas d'usage typiques :
- documents scannés
- captures d'écran
- photos de documents

L'OCR et la traduction sont **deux étapes distinctes**, mais peuvent être enchaînées.

---

### 4. Réécriture assistée par l'IA

- Réécriture d'un texte existant sans changer de langue
- Objectifs possibles :
  - reformulation (mode Rewrite)
  - correction grammaticale et orthographique (mode Correct only)
- Tons disponibles : configurables depuis l'admin (min 1, max 6), avec label multilingue EN/FR/DE/IT et instruction de prompt personnalisée
- Tons par défaut : Professional, Casual, Friendly, Authoritative, Empathetic, Creative
- Chaque ton peut être activé/désactivé sans suppression
- Longueur : Shorter / Keep / Longer
- Intégration du glossaire

Cette fonctionnalité **n'est pas une traduction**, mais une transformation du texte source.

---

## 🧱 Stack technique

- Next.js 16 (App Router)
- TypeScript
- React 19
- API server-side intégrée (Backend-for-Frontend)
- Ollama (LLM local ou distant) via `/api/generate`
- Tailwind CSS v4 (configuration CSS-first avec `@theme`)
- Fonts : Manrope (headlines) + Inter (body) via `next/font/google`
- Material Symbols Outlined (icons) : **self-hébergé** — woff2 dans `public/fonts/material-symbols/`, `@font-face` + classe `.material-symbols-outlined` définis dans `globals.css`
- Bootstrap Icons (icônes fichiers dans Document Studio) : **self-hébergé** via package npm `bootstrap-icons`, importé directement dans `layout.tsx`
- **next-auth v5** (authentification OTP par email — `src/auth.ts`, `src/auth.config.ts`, `src/middleware.ts`)
- **pg** + **@auth/pg-adapter** (PostgreSQL — pool, sessions, utilisateurs)
- **zod** (validation des entrées dans les routes API admin)
- **@napi-rs/canvas** (conversion PDF → PNG pour l'OCR vision)
- **server-only** (protection des modules serveur)
- **Caddy v2** (reverse proxy — container `caddy:2-alpine`, ports 80/443, admin API interne sur `0.0.0.0:2019`)
- Docker / Docker Compose (appliance on-premise)

---

## 🏗️ Architecture (RÈGLE ABSOLUE)

Flux de données :

```
Internet / NPM (SSL)
→ Caddy :80  (reverse proxy, Docker)
→ app:3000   (Next.js)
→ Ollama /api/generate
```

### Règles non négociables

- Le client React **NE DOIT JAMAIS** appeler Ollama directement
- Toute interaction IA passe par une API server-side (`/api/*`)
- Les prompts système sont **centralisés** dans `src/lib/prompts.ts`
- Les appels IA sont **isolés** dans `src/lib/ollama.ts` (server-only)
- Aucun secret ne doit être exposé au client

---

## 📁 Structure de projet

```
src/
├── auth.ts                              (NextAuth config principale — OTP credentials provider)
├── auth.config.ts                       (Config NextAuth partagée — callbacks, pages)
├── middleware.ts                        (Protection des routes — redirect vers signin)
│
├── app/
│   ├── api/
│   │   ├── translate/route.ts           (Traduction texte — streaming)
│   │   ├── translate/document/route.ts  (Traduction documents — JSON blocks)
│   │   ├── rewrite/route.ts             (Réécriture IA — streaming)
│   │   ├── ocr/route.ts                 (OCR image via Ollama vision — streaming)
│   │   ├── extract/document/route.ts    (Extraction document sans traduction)
│   │   ├── export/docx/route.ts         (Export du résultat en fichier DOCX)
│   │   ├── site-assets/[filename]/route.ts (Sert logo et bg image depuis /tmp/uploads)
│   │   ├── auth/otp/route.ts            (Génère et retourne le code OTP)
│   │   ├── auth/[...nextauth]/route.ts  (Handler NextAuth)
│   │   ├── user/
│   │   │   └── glossary-prefs/route.ts  (GET préférences glossaires user + PATCH toggle)
│   │   └── admin/
│   │       ├── audit/route.ts           (Journal d'audit paginé)
│   │       ├── audit/purge/route.ts     (Suppression entrées avant date)
│   │       ├── background/route.ts      (Mise à jour image de fond)
│   │       ├── glossary/route.ts        (Liste glossaires GET + création POST)
│   │       ├── glossary/[id]/route.ts   (Suppression glossaire DELETE)
│   │       ├── glossary/[id]/entries/route.ts        (Liste + ajout entrées GET/POST)
│   │       ├── glossary/[id]/entries/[eid]/route.ts  (Suppression entrée DELETE)
│   │       ├── glossary/[id]/import/route.ts         (Import CSV POST)
│   │       ├── logo/route.ts            (Upload/suppression du logo)
│   │       ├── services/route.ts        (Config Ollama + PostgreSQL + Caddy GET/PATCH — discriminatedUnion sur service=)
│   │       ├── services/ollama/test/route.ts    (Test connexion Ollama)
│   │       ├── services/ollama/metrics/route.ts (Métriques Ollama : version, latence, modèles, running)
│   │       ├── services/ollama/unload/route.ts  (Décharge un modèle — keep_alive: 0)
│   │       ├── services/ollama/warmup/route.ts  (Charge les modèles configurés en VRAM — keep_alive: -1, dédupliqués)
│   │       ├── services/db/test/route.ts        (Test connexion PostgreSQL)
│   │       ├── services/db/metrics/route.ts     (Métriques PostgreSQL : version, taille, connexions, tables)
│   │       ├── services/caddy/metrics/route.ts  (Métriques Caddy : reachable, version, upstreams — GET http://caddy:2019)
│   │       ├── settings/route.ts        (Réglages site GET/PATCH)
│   │       ├── settings/export/route.ts (Export config JSON)
│   │       ├── settings/import/route.ts (Import config JSON)
│   │       ├── settings/reset/route.ts  (Réinitialisation aux défauts)
│   │       ├── usage/route.ts           (Stats d'utilisation IA — param `limit` 1–500, défaut 100)
│   │       ├── usage/purge/route.ts     (Suppression stats avant date)
│   │       ├── users/route.ts           (Liste utilisateurs)
│   │       └── users/[id]/route.ts      (Mise à jour rôle utilisateur)
│   ├── admin/
│   │   ├── layout.tsx                   (requireAdmin + AdminClientLayout + AdminSidebar)
│   │   ├── settings/page.tsx            (AdminPageHeader + SettingsTabs — max-w-[1400px])
│   │   ├── services/page.tsx            (redirect → /admin/services/ai)
│   │   ├── services/ai/page.tsx         (AdminPageHeader "servicesAi" + grille [2fr_3fr] : ServicesPanel | OllamaMetrics)
│   │   ├── services/db/page.tsx         (AdminPageHeader "servicesDb" + grille [2fr_3fr] : ServicesPanel | DbMetrics)
│   │   ├── services/caddy/page.tsx      (AdminPageHeader "servicesCaddy" + grille [2fr_3fr] : ServicesPanel | CaddyMetrics)
│   │   ├── glossary/page.tsx            (AdminPageHeader "glossary" + GlossaryAdmin)
│   │   ├── users/page.tsx               (AdminPageHeader + UserList)
│   │   ├── usage/page.tsx               (AdminPageHeader + UsagePanel)
│   │   ├── audit/page.tsx               (AdminPageHeader + AuditTable)
│   │   └── backup/page.tsx              (AdminPageHeader + ExportImportForm)
│   ├── auth/
│   │   └── signin/page.tsx              (Server component async — charge siteName depuis settings, passe en prop à SignInForm)
│   ├── maintenance/
│   │   └── page.tsx                     (Page maintenance — affichée si maintenanceMode actif)
│   ├── settings/
│   │   └── page.tsx                     (I18nProvider + profil + toggles glossaires + session)
│   ├── globals.css                      (Tailwind v4 @theme + @font-face Material Symbols + classes CSS custom)
│   ├── layout.tsx                       (Fonts next/font, import bootstrap-icons/font/bootstrap-icons.css)
│   └── page.tsx                         (Workspace — tabs centrés)
│
├── components/
│   ├── GlobalBanner.tsx                 (Bannière globale — affichée si globalBanner configuré)
│   ├── tabs/
│   │   ├── TextTranslationTab.tsx       (Debounce 400ms detect + 800ms translate, swap, formality, auto-scroll output)
│   │   ├── DocumentStudioTab.tsx        (Upload → extract → translate → blocks HTML)
│   │   ├── ImageExtractionTab.tsx       (OCR + traduction optionnelle, stats, auto-scroll output)
│   │   └── AIRewriteTab.tsx             (Modes rewrite/correct, tons configurables, length, auto-scroll output)
│   ├── ui/
│   │   ├── HomeClient.tsx               (I18nProvider wrapper + HomeWorkspace interne)
│   │   ├── AccountMenu.tsx              (Menu utilisateur — positionné par HomeClient)
│   │   ├── SignInForm.tsx               (Client component — formulaire OTP signin, reçoit siteName en prop)
│   │   ├── UILanguageSwitcher.tsx       (Switcher EN/DE/FR/IT avec drapeaux SVG inline)
│   │   └── LanguageDropdown.tsx         (Liste alphabétique unifiée, favoris, portal fixe)
│   └── admin/
│       ├── AdminClientLayout.tsx        (Fournit I18nProvider aux composants admin)
│       ├── AdminPageHeader.tsx          (Titre + description traduits, section= : settings|servicesAi|servicesDb|servicesCaddy|glossary|users|usage|audit|backup)
│       ├── AdminSidebar.tsx             (Navigation admin — Settings, Services [en-tête] > Ollama + PostgreSQL + Caddy, Glossary, Users, Usage, Audit, Backup)
│       ├── AdminToast.tsx               (Composant toast + type ToastState — types : 'success' | 'warning' | 'error')
│       ├── AdminToastWrapper.tsx        (Wrapper de positionnement du toast)
│       ├── SettingsTabs.tsx             (Onglets Identité/Interface/Fonctionnalités/Tonalités/Accès — sous-blocs en grille lg:grid-cols-2)
│       ├── BrandingForm.tsx             (Logo, couleurs, fond, mode sombre — sous-blocs en grille)
│       ├── DesignForm.tsx               (Radius boutons, taille logo, footer — sous-blocs en grille)
│       ├── FeaturesForm.tsx             (Modules actifs, langues défaut, limites API — sous-blocs en grille)
│       ├── TonesForm.tsx                (CRUD tonalités : label EN/FR/DE/IT, instruction prompt, on/off, min 1 / max 6)
│       ├── GeneralForm.tsx              (Email contact, bannière, mode maintenance — sous-blocs en grille)
│       ├── ExportImportForm.tsx         (Export/Import configuration JSON)
│       ├── ServicesPanel.tsx            (Client wrapper pour OllamaServiceForm | DbServiceForm | CaddyServiceForm selon mode="ai"|"db"|"caddy")
│       ├── OllamaServiceForm.tsx        (Config Ollama, test connexion, bouton "Load into VRAM" — POST /api/admin/services/ollama/warmup)
│       ├── DbServiceForm.tsx            (Config PostgreSQL, test connexion)
│       ├── CaddyServiceForm.tsx         (Config Caddy : host, behindProxy toggle, preview Caddyfile live — PATCH /api/admin/services)
│       ├── OllamaMetrics.tsx            (Métriques Ollama live : statut, modèles installés, modèles en mémoire + Unload)
│       ├── DbMetrics.tsx                (Métriques PostgreSQL live : statut serveur, connexions, tables application)
│       ├── CaddyMetrics.tsx             (Métriques Caddy live : reachable, version, upstream app:3000 health)
│       ├── GlossaryAdmin.tsx            (CRUD glossaires nommés + entrées avec paires de langues + import CSV + export CSV client-side)
│       ├── UserList.tsx                 (Tableau utilisateurs, toggle rôle admin)
│       ├── UsagePanel.tsx               (Stats IA filtrées par date, export CSV, sélecteur lignes/page 25–500)
│       ├── AuditTable.tsx               (Journal d'audit paginé)
│       └── PurgeButton.tsx              (Purge avec confirmation et date)
│
├── hooks/
│   └── useCopyToClipboard.ts            (Hook partagé copie presse-papiers + feedback 2s)
│
├── locales/
│   ├── en.ts                            (Source canonique — définit le type Messages)
│   ├── de.ts                            (Traduction allemande — satisfies Messages)
│   ├── fr.ts                            (Traduction française — satisfies Messages)
│   └── it.ts                            (Traduction italienne — satisfies Messages)
│
├── lib/
│   ├── i18n.tsx                         (I18nProvider, useI18n, UILocale — zero-dep)
│   ├── caddy.ts                         (SERVER-ONLY: CaddyConfig, generateCaddyfile(), reloadCaddy() — POST http://caddy:2019/load)
│   ├── ollama.ts                        (SERVER-ONLY: streamOllamaResponse, callOllama, getOllamaConfig)
│   ├── prompts.ts                       (Factory prompts: translate, document, ocr, rewrite, correct)
│   ├── tones.ts                         (SERVER-ONLY: DEFAULT_TONES, getConfiguredTones — fallback + migration DB)
│   ├── file-parser.ts                   (SERVER-ONLY: parsePdf, parseDocx, parseTxt, Block model)
│   ├── pdf-vision.ts                    (SERVER-ONLY: parsePdfWithVision — OCR via Ollama vision)
│   ├── validators.ts                    (Limites: text=5000, doc=12000, image=10MB + validateFileExtension)
│   ├── languages.ts                     (LANGUAGES[] triés BCP47 + detectLanguage())
│   ├── glossary.ts                      (SERVER-ONLY: fetchGlossaryEntries, buildTranslationGlossaryClause, buildRewriteGlossaryClause, parseGlossaryCSV)
│   ├── settings.ts                      (SERVER-ONLY: getSetting, updateSetting, getAllSettings)
│   ├── db.ts                            (SERVER-ONLY: pool PostgreSQL + query() helper)
│   ├── admin-guard.ts                   (SERVER-ONLY: requireAdmin, getAdminSession)
│   ├── features-guard.ts                (SERVER-ONLY: isFeatureEnabled — vérifie site_settings.features)
│   ├── limits.ts                        (SERVER-ONLY: getDynamicLimits — lit limites depuis DB avec fallback)
│   ├── audit.ts                         (SERVER-ONLY: logAudit — fire-and-forget)
│   ├── usage.ts                         (SERVER-ONLY: logUsage — fire-and-forget)
│   ├── otp.ts                           (SERVER-ONLY: generateOtp, verifyOtp, getOrCreateUser)
│   ├── crypto.ts                        (SERVER-ONLY: encrypt/decrypt AES-256-GCM)
│   └── color-utils.ts                   (buildColorVars — génère variables CSS couleur depuis settings)
│
└── types/
    ├── leksis.ts                        (Language, Block, Formality, RewriteTone, RewriteLength, ToneConfig, Glossary, GlossaryEntry, etc.)
    └── next-auth.d.ts                   (Extension Session + JWT pour next-auth)
```

---

## 🌍 Internationalisation (i18n)

L'interface est entièrement traduite en **Anglais (EN), Allemand (DE), Français (FR) et Italien (IT)**.

### Architecture

- **Zéro dépendance** : contexte React custom (`src/lib/i18n.tsx`) en ~50 lignes
- Locale initiale : détectée depuis `navigator.language` (ex. `fr-CH` → `fr`) si supportée, sinon `en`
- Préférence persistée dans `localStorage` (clé : `leksisUILocale`) — prioritaire sur la détection navigateur
- Strings imbriquées à 2 niveaux : `composant.clé` (ex: `t.textTab.translate`)
- `en.ts` est la **source de type** via `DeepString<typeof messages>` → `Messages`
- `de.ts`, `fr.ts` et `it.ts` utilisent `satisfies Messages` pour garantir la couverture complète à la compilation
- Interpolation dynamique via `{0}`, `{1}` et `.replace()` inline (ex: `t.userList.toastRoleUpdated.replace('{0}', email)`)

### Sélecteur de langue

- `UILanguageSwitcher` dans le header, à gauche de `AccountMenu`
- Affiche le **drapeau SVG inline** de la locale active (pas de texte)
- Dropdown avec drapeau + code court (EN/DE/FR/IT) + checkmark sur la locale active
- Drapeaux : `FlagGB` (Union Jack avec saltire counterchangé via clipPath), `FlagDE`, `FlagFR`, `FlagIT`

### Pattern provider

Les composants appelant `useI18n()` doivent être enfants d'un `I18nProvider`.

| Contexte | Provider |
|----------|----------|
| Workspace principal | `HomeClient` wraps `I18nProvider` → `HomeWorkspace` |
| Section admin | `AdminClientLayout` (importé dans `admin/layout.tsx`) |
| Page settings | `SettingsPage` wraps `I18nProvider` → `SettingsContent` |
| Page signin | `SignInPage` (server) wraps `I18nProvider` → `SignInForm` (client, reçoit `siteName` prop) |

### Espaces de noms définis

`home`, `account`, `textTab`, `docTab`, `imgTab`, `rewriteTab`, `langDropdown`, `langSwitcher`, `settingsPage`, `adminSidebar`, `adminPages`, `settingsTabs`, `brandingForm`, `designForm`, `featuresForm`, `tonesForm`, `generalForm`, `ollamaForm`, `dbForm`, `caddyForm`, `glossaryAdmin`, `userList`, `usagePanel`, `auditTable`, `purgeButton`, `backupForm`, `signIn`

---

## 🎨 UI / Design

### Layout

- Header : barre de tabs centrée — à droite, un wrapper flex `absolute right-4` contient `UILanguageSwitcher` + `AccountMenu`
- Workspace : `max-w-[1440px]`, `px-6 md:px-8`, `pt-6`
- Footer 3 colonnes : Privacy / Precision / Editorial

### Pages admin — conventions de mise en page

- Wrapper page : `p-8 max-w-[1400px]`
- **Pages Services (Ollama, PostgreSQL, Caddy)** : grille `grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6 items-start` — formulaire config à gauche, blocs métriques à droite
- **Page Réglages** : tabs de navigation (5 onglets), sous-blocs de chaque formulaire en `grid grid-cols-1 lg:grid-cols-2 gap-3 items-start` avec deux `<div className="flex flex-col gap-3">` explicites (colonne gauche + colonne droite) — ne jamais laisser CSS Grid auto-placer les cartes (crée des espaces vides égaux à la hauteur de la rangée la plus haute), bouton Save hors grille
- **Style de carte admin** : `bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6` — utilisé uniformément pour formulaires et blocs métriques
- **Blocs métriques** (OllamaMetrics, DbMetrics, CaddyMetrics) : bouton Refresh dans l'en-tête du bloc Statut, blocs supplémentaires côte à côte (`xl:grid-cols-2`)

### Panneaux de traduction (tous les tabs)

Structure exacte à préserver :
```
grid grid-cols-1 md:grid-cols-2 gap-px bg-surface-container
overflow-hidden rounded-xl border border-outline-variant/10 relative
```
- Panel gauche : `bg-surface-container-lowest p-8 min-h-[460px]`
- Panel droite : `bg-surface-container-low p-8 min-h-[460px]`
- Le `gap-px` + `bg-surface-container` crée le séparateur 1px entre les panneaux
- Swap button : `absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2`, cercle avec `rounded-full`
- **Auto-scroll** : le div output (`outputRef`) scroll automatiquement vers le bas pendant le streaming (`isLoading === true`). Implémenté via `useRef<HTMLDivElement>` + `useEffect` sur `[outputText, isLoading]` dans TextTranslationTab, AIRewriteTab, ImageExtractionTab

### Language selector (LanguageDropdown)

- Trigger inline : `text-xs font-bold tracking-wider uppercase` + icône `expand_more`
- Source lang : couleur `text-primary`
- Target lang : couleur `text-on-surface group-hover:text-primary`
- Dropdown : `createPortal` positionné via `getBoundingClientRect()` (fixed, z-200)
- Liste : **toutes les langues triées alphabétiquement** (base + régionales mélangées)
- Favoris en tête de liste (hors recherche), étoile au hover

### Design tokens

Palette Material Design 3 définie dans `globals.css` via `@theme` (Tailwind v4) :
- `primary` #565e74, `on-primary` #f7f7ff
- `surface` / `surface-container-lowest` / `surface-container-low` / `surface-container`
- `on-surface`, `on-surface-variant`, `outline`, `outline-variant`
- `error` #9f403d

Classes CSS custom dans `globals.css` : `.icon-btn`, `.text-button`, `.action-btn`, `.toolbar`, `.boundaries`, `.formal-btn`, `.tone-btn`, `.tab-btn`, `.lang-row`, `.star-btn`, `.footer-title`, `.footer-text`, `.translation-text`

---

## 🤖 Ollama & IA

- Ollama est configuré via variables d'environnement (`.env.development.local`)
- `OLLAMA_BASE_URL=http://192.168.1.39:11434`
- `OLLAMA_MODEL=translategemma:27b`
- API utilisée : `/api/generate` avec `stream: true`
- Tous les appels sont **exclusivement server-side** (`src/lib/ollama.ts`)
- `streamOllamaResponse()` → `ReadableStream<Uint8Array>` pour les routes streaming
- `callOllama()` → `string` pour les routes qui attendent le résultat complet (traduction document)

---

## 📝 Prompts

Tous les prompts sont dans `src/lib/prompts.ts` :

| Fonction | Usage |
|----------|-------|
| `buildTranslationPrompt()` | Traduction texte libre (avec formality + glossaire optionnels) |
| `buildDocumentTranslationPrompt()` | Traduction segments `\|\|\|` |
| `buildOcrPrompt()` | Extraction texte image (tables en markdown) |
| `buildRewritePrompt()` | Réécriture (instruction de ton + length + glossaire) |
| `buildCorrectPrompt()` | Correction grammaticale |
| `buildLangClause()` | Clause "respond in [lang] only" |

---

## 🔐 Sécurité & bonnes pratiques

- Séparation stricte client / serveur
- Aucun secret exposé côté client
- Aucune logique IA dans les composants React
- Validation des entrées dans `src/lib/validators.ts` (+ zod dans les routes admin)
- Authentification OTP : code généré et retourné au client pour affichage immédiat (on-premise, pas d'envoi email)
- Mots de passe DB chiffrés AES-256-GCM via `src/lib/crypto.ts` avant stockage en base
- `AUTH_TRUST_HOST=1` requis dans `.env` lorsque l'app est derrière un reverse proxy (Caddy/NPM) — sans ça, NextAuth v5 rejette les requêtes
- Admin protégé par `requireAdmin()` dans chaque page et route admin
- Logs d'audit fire-and-forget via `src/lib/audit.ts`

---

## 🚀 Script de déploiement (`install.sh`)

Le script `install.sh` à la racine du projet gère le cycle de vie complet de l'appliance on-premise.

### Interface TUI

- Utilise **`dialog`** pour une interface plein-écran dans le terminal
- `dialog` est **installé automatiquement** au démarrage si absent (`apt-get` / `dnf` / `yum`)
- Rendu : `NCURSES_NO_UTF8_ACS=1` + `LANG=C.UTF-8` pour les caractères box-drawing Unicode (─ │ ┌ └…). Fallback `--ascii-lines` automatique si `TERM=linux` ou `TERM=dumb`
- Tous les appels `dialog` utilisent `</dev/tty >/dev/tty` pour garantir le rendu même en sous-shell (`$(...)`)

### Commandes disponibles

| Commande | Description |
|----------|-------------|
| `install` | Installation guidée (5 formulaires `--form` + build Docker) |
| `update` | Mise à jour sélective via `--checklist` |
| `uninstall` | Suppression complète avec confirmation `DELETE` |
| `status` | État des services, GPU, modèles, volumes dans un `--textbox` |
| `config` | Édition des variables `.env` via `--form` (9 champs, dont `POSTGRES_VERSION`) |
| `logs` | Streaming des logs via `--programbox` |

### Architecture interne

- **Wrappers dialog** : `d_input`, `d_yesno`, `d_password`, `d_msg`, `d_info` — ne jamais appeler `dialog` directement depuis les commandes
- **`DIALOG_TMP`** : fichier temp global (mktemp) pour capturer les sorties dialog — ne pas utiliser `$()` pour capturer `dialog`, toujours lire `$DIALOG_TMP` après l'appel
- **`BACKTITLE`** : titre global affiché dans toutes les fenêtres dialog
- Opérations longues (build Docker, pull modèles, git clone) → `--programbox` avec pipe
- Aperçu `.env` avant écriture → `--textbox` sur fichier tmp avec secrets masqués

### Règles pour modifier install.sh

- Toujours passer par les wrappers `d_*` — ne jamais appeler `dialog` directement dans les fonctions `cmd_*`
- Ajouter `</dev/tty >/dev/tty` sur tout nouveau appel `dialog` dans les wrappers
- Parser la sortie `--form` avec `mapfile -t _f < "$DIALOG_TMP"` (ordre des champs = ordre de déclaration)
- Parser la sortie `--checklist` avec `tr -d '"'` puis `IFS=' ' read -ra arr`
- Ne jamais supprimer `NCURSES_NO_UTF8_ACS=1` ni le fallback `--ascii-lines`
- `cmd_update` contient un **guard de backfill** : si `.env` ne contient pas `POSTGRES_VERSION`, il écrit automatiquement `POSTGRES_VERSION=16` pour protéger les données existantes contre une migration accidentelle de version majeure PostgreSQL
- `cmd_update` propose 5 composants sélectionnables : `app`, `caddy`, `postgres`, `ollama`, `ollama models`
- `cmd_logs` propose 4 services : `app`, `caddy`, `postgres`, `ollama`

---

## 🧪 Développement local

```bash
npm run dev   # → http://localhost:3000
npm run build # vérification build production
```

Flux local :
- Le frontend appelle les routes `/api/*`
- Le Gateway appelle Ollama via `${OLLAMA_BASE_URL}/api/generate`

---

## 🧠 Instructions spécifiques à Claude Code

- Respecter strictement les **4 fonctionnalités définies**
- Ne jamais appeler Ollama depuis le client
- Conserver la structure exacte des panneaux (`gap-px bg-surface-container rounded-xl`)
- La liste des langues doit toujours être **triée alphabétiquement** (base + régionales mélangées)
- Tous les strings UI doivent passer par `useI18n()` → `t.*` — ne jamais hardcoder de libellés
- Le titre affiché sur la page signin vient de `branding.siteName` (settings DB), chargé server-side dans `signin/page.tsx` — ne pas le hardcoder
- `getAllSettings()` retourne `Record<string, unknown>` — caster en `Record<string, Record<string, unknown>>` pour accéder aux propriétés imbriquées (ex. `branding.siteName`)
- Tout nouveau namespace i18n doit être ajouté dans les **4 fichiers** (`en.ts`, `de.ts`, `fr.ts`, `it.ts`) simultanément
- Les valeurs envoyées à l'API (id de ton, longueurs, features) restent des slugs stables — seul l'affichage est traduit via `labels[locale]`
- Les tons de réécriture sont dans `site_settings` (clé `rewrite_tones`, JSONB array). `src/lib/tones.ts` gère les défauts et la migration backward compat (`label: string` → `labels: { en }`)
- `ToneConfig.labels` : `en` requis, `fr`, `de` et `it` optionnels avec fallback sur `en`
- Le glossaire est **centralisé en base de données** (tables `glossaries`, `glossary_entries`, `user_glossary_prefs`) — plus de localStorage
- `src/lib/glossary.ts` est **server-only** : `fetchGlossaryEntries()` lit la DB et respecte les préférences utilisateur
- L'injection du glossaire dans les prompts est **exclusivement server-side** (routes `/api/translate` et `/api/rewrite`) — le client n'envoie jamais de `glossaryClause`
- Chaque entrée de glossaire a `source_lang` / `target_lang` (code BCP47 ou NULL = toutes les langues). Pour la réécriture (même langue), seules les entrées NULL+NULL sont injectées
- Convention `user_glossary_prefs` : une ligne n'existe que si `enabled = FALSE` — absence de ligne = glossaire activé par défaut
- Format CSV d'import glossaire : `source,target,source_lang,target_lang` (cols lang optionnelles, vide = toutes langues)
- Export CSV glossaire : **100 % client-side** (`exportEntriesToCSV` dans `GlossaryAdmin.tsx`) — pas de route API. Bouton visible uniquement si des entrées existent. Nom de fichier : `{glossary_name}_glossary.csv`
- L'API usage (`/api/admin/usage`) accepte un paramètre `limit` (1–500, défaut 100) pour contrôler le nombre de lignes retournées. `UsagePanel` expose un sélecteur 25/50/100/200/500
- Migration DB : `scripts/migrate-glossary.sql` pour les installations existantes, `docker/init-schema.sql` pour les nouveaux déploiements Docker
- **Versions Docker** : `postgres` utilise `${POSTGRES_VERSION:-18}-alpine` (configurable via `.env`). `node:22-slim` est épinglé (LTS actuel, Debian requis pour `@napi-rs/canvas`). `caddy:2-alpine` pour le reverse proxy. `ollama/ollama:latest` sans port binding hôte (interne uniquement). Ne jamais hardcoder `postgres:NN-alpine` — toujours passer par la variable. Changer la version majeure PostgreSQL sur une installation existante nécessite une migration de données (`pg_upgrade` ou dump/restore)
- **Ollama** : le port `11434` n'est **pas** exposé sur l'hôte — accessible uniquement via le réseau Docker interne (`http://ollama:11434`). Il n'y a plus de pré-chauffage automatique dans `install.sh` — le chargement en VRAM se fait depuis le panneau admin via le bouton "Load into VRAM" (`POST /api/admin/services/ollama/warmup`). La route déduplique les modèles (translationModel / rewriteModel / ocrModel) et appelle Ollama avec `keep_alive: -1` pour chacun
- **Caddy** : le Caddyfile est généré depuis `site_settings` (clé `caddy_config` JSONB) via `src/lib/caddy.ts`. Le rechargement à chaud se fait via `POST http://caddy:2019/load` (Content-Type: text/caddyfile). Si le rechargement échoue, le PATCH renvoie `{ ok: true, reloadError }` sans faire échouer la requête. L'admin API Caddy écoute sur `0.0.0.0:2019` (interne Docker uniquement — pas de port binding hôte). Caddy démarre avec `--resume` : au redémarrage, il charge `/data/config/autosave.json` si présent. Pour forcer le chargement du Caddyfile : `docker exec leksis-caddy caddy reload --config /etc/caddy/Caddyfile`. L'endpoint `GET /` retourne 404 en Caddy v2 — utiliser `GET /config/` pour vérifier la joignabilité
- **Aucun CDN tiers** : Material Symbols et Bootstrap Icons sont self-hébergés. Ne pas réintroduire de `<link>` vers `fonts.googleapis.com` ou `cdn.jsdelivr.net`. Pour mettre à jour Material Symbols, re-télécharger le woff2 depuis `fonts.gstatic.com` (URL versionnée `v{N}`)
- Priorité : robustesse, lisibilité, maintenabilité
- Les messages de commit git doivent toujours être **en anglais**

---

Fin du document.
