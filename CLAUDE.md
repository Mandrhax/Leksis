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
- Moteur IA : Ollama (`/api/generate`) **ou** API compatible OpenAI (`/v1/chat/completions` — vLLM, LM Studio, llama.cpp, OpenAI…), local ou distant
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
→ Ollama /api/generate  (conteneur `ollama` local — profil compose — ou serveur distant)
```

### Règles non négociables

- Le client React **NE DOIT JAMAIS** appeler Ollama directement
- Toute interaction IA passe par une API server-side (`/api/*`)
- Les prompts système sont **centralisés** dans `src/lib/prompts.ts`
- Les appels IA sont **isolés** dans `src/lib/llm/` (server-only, point d'entrée `@/lib/llm`) — un fournisseur (Ollama ou OpenAI-compatible) pour les 3 fonctions
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
│   │       ├── services/ai/test/route.ts        (Test de la config IA en cours d'édition : liste les modèles, latence, présence du modèle)
│   │       ├── services/ai/metrics/route.ts     (Métriques du moteur IA : fournisseur, capacités, version, latence, modèles, modèles en mémoire)
│   │       ├── services/ollama/unload/route.ts  (Décharge un modèle — keep_alive: 0)
│   │       ├── services/ollama/warmup/route.ts  (Charge les modèles configurés en VRAM — keep_alive: -1, dédupliqués)
│   │       ├── services/ollama/pull/route.ts    (Télécharge un modèle — stream ndjson de progression depuis /api/pull)
│   │       ├── services/ollama/delete/route.ts  (Supprime un modèle installé — DELETE /api/delete)
│   │       ├── services/db/test/route.ts        (Test connexion PostgreSQL)
│   │       ├── services/db/metrics/route.ts     (Métriques PostgreSQL : version, taille, connexions, tables)
│   │       ├── services/caddy/metrics/route.ts  (Métriques Caddy : reachable via GET /config/, version via HEAD http://caddy:80/ header Server, upstreams via GET /reverse_proxy/upstreams)
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
│   │   ├── page.tsx                     (redirect → /admin/dashboard)
│   │   ├── dashboard/page.tsx           (Server component — users/usage today/glossary/audit + tendance 7j et répartition par feature depuis usage_log + lastBackupAt depuis site_settings.system_status → AdminDashboard client)
│   │   ├── settings/page.tsx            (AdminPageHeader + SettingsTabs — max-w-[1400px])
│   │   ├── services/page.tsx            (redirect → /admin/services/ai)
│   │   ├── services/ai/page.tsx         (AdminPageHeader "servicesAi" + OllamaServicesLayout — onglets Connection/Models/Monitoring)
│   │   ├── services/db/page.tsx         (AdminPageHeader "servicesDb" + DbServicesLayout — onglets Connection/Monitoring)
│   │   ├── services/caddy/page.tsx      (AdminPageHeader "servicesCaddy" + CaddyServicesLayout — onglets Access/Monitoring)
│   │   ├── glossary/page.tsx            (AdminPageHeader "glossary" + GlossaryAdmin — max-w-[1400px])
│   │   ├── users/page.tsx               (AdminPageHeader + UserList — max-w-[1400px])
│   │   ├── usage/page.tsx               (AdminPageHeader + UsagePanel — max-w-[1400px])
│   │   ├── audit/page.tsx               (AdminPageHeader + AuditTable — max-w-[1400px])
│   │   └── backup/page.tsx              (AdminPageHeader + ExportImportForm — max-w-[1400px])
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
│       ├── AdminSidebar.tsx             (Navigation admin — flat nav, section labels SETTINGS/INFRASTRUCTURE/MANAGEMENT, status dots live par service, lien Dashboard)
│       ├── AdminToast.tsx               (Composant toast + type ToastState — types : 'success' | 'warning' | 'error')
│       ├── AdminToastWrapper.tsx        (Wrapper de positionnement du toast)
│       ├── SettingsTabs.tsx             (Onglets réglages via ServiceTabBar — 5 : Identity/Appearance/Features/Tones/General, tous montés en permanence (visibilité via `hidden`) pour ne pas perdre les saisies en changeant d'onglet, Reset to defaults en tête)
│       ├── ServiceTabBar.tsx            (Barre d'onglets soulignés partagée par AI/DB/Caddy/Settings — générique sur `T extends string`)
│       ├── AdminDashboard.tsx           (Dashboard admin client — santé services (Ollama/DB/Caddy/Leksis/Backup, 5 cartes cliquables), tuiles KPI (users/calls/glossary/models), tendance 7 jours des appels IA + répartition par feature, activité récente (5 entrées audit))
│       ├── BrandingForm.tsx             (Nom du site, logo + taille header, fond couleur/image (toggle mutuellement exclusif), couleur primaire, mode sombre — sous-blocs en grille)
│       ├── DesignForm.tsx               (Radius boutons, footer (texte/couleur/liens/toggle citations) — sous-blocs en grille)
│       ├── FeaturesForm.tsx             (Modules actifs, langues par défaut + tonalité par défaut (Formal/Informal), limites API — sous-blocs en grille)
│       ├── TonesForm.tsx                (CRUD tonalités : label EN/FR/DE/IT, instruction prompt, on/off, min 1 / max 6)
│       ├── GeneralForm.tsx              (Email contact, bannière, mode maintenance — sous-blocs en grille)
│       ├── ExportImportForm.tsx         (Carte statut sauvegarde complète (`lastBackupAt`, prop serveur) + Export/Import configuration JSON — logo/fond embarqués en base64 dans l'export)
│       ├── AiServiceForm.tsx            (Config du moteur IA : choix Ollama / API OpenAI-compatible, URL, clé API, case « serveurs hors réseau privé », 3 sélecteurs `OllamaModelSelect`, test connexion ; « Load into VRAM » seulement pour Ollama — rendu en 2 panneaux Connection/Models selon le prop `activeTab` reçu d'`OllamaServicesLayout`, formulaire toujours monté pour préserver les saisies)
│       ├── OllamaModelSelect.tsx        (Sélecteur de modèle : installés / suggérés non installés / « Autre… » ; modèle absent du serveur → « Télécharger et utiliser » = pull avec barre de progression puis sauvegarde de la config. Repli en input + datalist si le serveur est injoignable)
│       ├── DbServiceForm.tsx            (Config PostgreSQL, test connexion)
│       ├── CaddyServiceForm.tsx         (Accès & HTTPS : 3 modes http / https (domaine) / proxy, secours HTTP, adresses de proxy — 2 colonnes : réglages à gauche, aperçu du Caddyfile à droite (sticky) — PATCH /api/admin/services)
│       ├── OllamaServicesLayout.tsx     (Layout page Ollama : ServiceTabBar 3 onglets Connection/Models/Monitoring — `AiServiceForm` toujours rendu (monitoring caché via prop), blocs Monitoring affichés seulement sur cet onglet — wraps OllamaMetricsProvider)
│       ├── DbServicesLayout.tsx         (Layout page PostgreSQL : ServiceTabBar 2 onglets Connection/Monitoring — `DbServiceForm` et `DbMetrics` tous deux montés en permanence, visibilité via `hidden`)
│       ├── CaddyServicesLayout.tsx      (Layout page Caddy : ServiceTabBar 2 onglets Access/Monitoring — `CaddyServiceForm` et `CaddyMetrics` tous deux montés en permanence, visibilité via `hidden`)
│       ├── OllamaMetrics.tsx            (Métriques Ollama : OllamaMetricsProvider (contexte fetch+delete, `useOllamaMetrics` + `formatBytes` exportés), OllamaStatusBlock, OllamaInstalledBlock (corbeille par modèle), OllamaRunningBlock)
│       ├── DbMetrics.tsx                (Métriques PostgreSQL live : statut serveur, connexions, tables application)
│       ├── CaddyMetrics.tsx             (Métriques Caddy live : reachable, version, upstream app:3000 health)
│       ├── GlossaryAdmin.tsx            (CRUD glossaires nommés + entrées avec paires de langues + import CSV + export CSV client-side)
│       ├── UserList.tsx                 (Tableau utilisateurs, toggle rôle admin)
│       ├── UsagePanel.tsx               (Stats IA filtrées par date, export CSV, sélecteur lignes/page 25–500)
│       ├── AuditTable.tsx               (Journal d'audit paginé)
│       └── PurgeButton.tsx              (Purge avec confirmation et date)
│
├── hooks/
│   ├── useCopyToClipboard.ts            (Hook partagé copie presse-papiers + feedback 2s)
│   └── useOllamaPull.ts                 (Hook client : pull d’un modèle via /api/admin/services/ollama/pull, progression agrégée par couche — utilisé par OllamaModelSelect)
│
├── locales/
│   ├── en.ts                            (Source canonique — définit le type Messages)
│   ├── de.ts                            (Traduction allemande — satisfies Messages)
│   ├── fr.ts                            (Traduction française — satisfies Messages)
│   └── it.ts                            (Traduction italienne — satisfies Messages)
│
├── lib/
│   ├── i18n.tsx                         (I18nProvider, useI18n, UILocale — zero-dep)
│   ├── caddy-config.ts                  (CLIENT-SAFE : AccessMode, CaddyConfig, resolveCaddyConfig, normalizeCaddyConfig, generateCaddyfile — partagé serveur/formulaire)
│   ├── caddy.ts                         (SERVER-ONLY: reloadCaddy() — POST http://caddy:2019/load — + ré-exports de caddy-config)
│   ├── caddy-tls.ts                     (SERVER-ONLY: checkCertificate() — état du certificat HTTPS via TLS vers caddy:443)
│   ├── llm/                             (SERVER-ONLY sauf types.ts : types, ollama-provider, openai-provider, config, service, network, index — voir « Moteur IA »)
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
- **Pages Services (Ollama/PostgreSQL/Caddy) et Réglages** : toutes les 4 utilisent le même pattern d'onglets soulignés via le composant partagé `ServiceTabBar` (générique `<T extends string>`, style `.tab-btn` du workspace principal) — plus de grille 2 colonnes ni d'accordéon. Ollama : Connection/Models/Monitoring. PostgreSQL : Connection/Monitoring. Caddy : Access/Monitoring. Réglages (`SettingsTabs`) : Identity/Appearance/Features & limits/AI tones/General
- **Formulaires + panneaux d'un onglet restent montés en permanence**, visibilité pilotée par `hidden` (CSS) ou par un prop `activeTab` lu en interne (cas d'`AiServiceForm`, dont Connection et Models partagent le même state et la même barre d'actions Save) — jamais de démontage/remontage au changement d'onglet, pour ne pas perdre une saisie non sauvegardée
- **Page Réglages** (`SettingsTabs`) : bouton "Reset to defaults" au-dessus de la barre d'onglets (reset global, pas par onglet)
- **Onglet Access/Caddy** : 2 colonnes (`grid-cols-1 lg:grid-cols-2`) — réglages d'accès à gauche, aperçu du Caddyfile généré à droite (`lg:sticky lg:top-6`)
- **Onglet Monitoring** (Ollama/DB/Caddy) : contient le statut serveur complet (version/latence/etc.) — plus de bande de statut séparée en haut de page (`OllamaStatusStrip`/`DbStatusStrip`/`CaddyStatusStrip` supprimés, redondants avec le bloc Statut de l'onglet Monitoring)
- Sous-blocs internes de chaque formulaire de réglages en `grid grid-cols-1 lg:grid-cols-2 gap-3 items-start` avec deux `<div className="flex flex-col gap-3">` explicites (colonne gauche + colonne droite) — ne jamais laisser CSS Grid auto-placer les cartes, bouton Save hors grille
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

## 🤖 Moteur IA (Ollama ou API compatible OpenAI)

Un **seul fournisseur** pour les 3 fonctions (traduction, réécriture, OCR) — choisi dans l'admin (Services → AI) ou à l'installation :

| Fournisseur | API | Usage |
|---|---|---|
| `ollama` | `/api/generate` (NDJSON) | conteneur local (profil compose `ollama`) ou serveur Ollama distant |
| `openai` | `/v1/chat/completions` (SSE) + `/v1/models` | vLLM, LM Studio, llama.cpp, OpenRouter, OpenAI… (clé API optionnelle, `Authorization: Bearer`) |

### Architecture (`src/lib/llm/`, server-only sauf `types.ts`)

- `types.ts` — types partagés (importables côté client en `import type`) : `LlmProvider`, `LlmRequest`, `LlmCapabilities`, `AiMetricsResult`, `AiPublicConfig`
- `ollama-provider.ts` / `openai-provider.ts` — `createOllamaProvider(url)` / `createOpenAiProvider(url, key)` : `stream(req)` → `ReadableStream<Uint8Array>` de **texte brut** (les routes et le client ne voient jamais NDJSON/SSE), `complete(req)` → `string`, `listModels()`. `openai` : `system` → message `system`, `images` (base64) → blocs `image_url` (data URI, MIME détecté), base `http://h:8000` normalisée en `.../v1`
- `config.ts` — `getAiConfig()` (ai_config → ancienne clé `ollama_config` → env), `getAi()` / `getAiOrError()` (config + provider, **lève/renvoie une erreur si le serveur est externe non autorisé**), `getOllamaAdminBase()` (actions Ollama-only), `aiErrorResponse()`
- `service.ts` — `fetchAiMetrics()` (modèles, latence, version, modèles en mémoire Ollama), `sameModelName()`
- `network.ts` — `isExternalUrl()` : IP/nom hors réseau privé (RFC1918, loopback, link-local, CGNAT, `.local/.lan/.internal`, noms sans point) ; un nom public est résolu en DNS (fail closed)
- `index.ts` — point d'entrée unique : **les routes n'importent que `@/lib/llm`** (plus de `src/lib/ollama.ts`)

Usage dans une route : `const ai = await getAiOrError(); if (ai.error) return ai.error; const { cfg, provider } = ai.ai` puis `provider.stream({ prompt, system?, images?, model: cfg.translationModel, signal })` (streaming) ou `provider.complete(...)` (traduction document, OCR PDF via `parsePdfWithVision(buffer, provider, model, signal)`).

### Configuration

- Base `site_settings.ai_config` : `{ provider, baseUrl, apiKeyEnc, translationModel, ocrModel, rewriteModel, sameModelForAll, allowExternal }`. **La clé API est chiffrée AES-256-GCM (`crypto.ts`), jamais renvoyée au client** (`hasApiKey`), jamais dans le journal d'audit (`updateSetting(..., auditValue)`), jamais exportée ni importée (export/import strippent `apiKeyEnc`, l'import conserve aussi `allowExternal` existant)
- Précédence : `ai_config` (base) → `ollama_config` (ancienne clé, lecture seule) → variables d'environnement `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, puis `OLLAMA_BASE_URL` ; les 3 modèles restent `OLLAMA_MODEL` / `OLLAMA_OCR_MODEL` / `OLLAMA_REWRITE_MODEL` (quel que soit le fournisseur). La clé enregistrée ne suit pas un changement d'URL/fournisseur (PATCH et test)
- **Serveurs externes bloqués par défaut** : tant que `allowExternal` n'est pas coché (Admin → Services → AI : « Autoriser les serveurs hors du réseau privé »), toute requête vers un hôte hors réseau privé est refusée (403 `external_blocked`) et la sauvegarde d'une telle URL est rejetée. Les textes des utilisateurs quittent alors le réseau : c'est un choix explicite de l'admin
- Capacités (`capabilities`) : seul Ollama sait `pull`, `delete`, `warmup` (VRAM), `unload`, `running`. Les routes `services/ollama/{pull,delete,warmup,unload}` répondent 400 pour un autre fournisseur ; l'UI masque ces blocs

### Routes admin

- `GET /api/admin/services/ai/metrics` (générique) et `POST /api/admin/services/ai/test` (teste la config **en cours d'édition** ; renvoie `ok`, `code`, `models`, `modelFound` — les messages sont construits côté client en i18n)
- `PATCH /api/admin/services` avec `service: 'ai'` (zod `AiSchema`)

### Points d'attention

- Les prompts (`src/lib/prompts.ts`) sont des chaînes libres envoyées comme message `user` : avec certains modèles servis par vLLM (ex. TranslateGemma, dont le chat template attend une structure de contenu), le résultat peut différer de celui d'Ollama — à valider par modèle
- Pas d'équivalent à `keep_alive` / `num_ctx` pour `openai` (gérés côté serveur) ; l'OCR exige un modèle multimodal
- Aucun appel IA depuis le client, jamais (règle inchangée)

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
- Admin protégé par `requireAdmin()` dans chaque page et route admin
- Logs d'audit fire-and-forget via `src/lib/audit.ts`

---

## 🚀 Script de déploiement (`install.sh`)

Le script `install.sh` à la racine du projet gère le cycle de vie complet de l'appliance on-premise.

### Interface

- **TUI [gum](https://github.com/charmbracelet/gum)** (Charm) avec **repli automatique en texte simple**. `ensure_gum` télécharge un binaire épinglé (`GUM_VERSION`) depuis les releases GitHub, vérifie son SHA256 (`GUM_SHA256_AMD64` / `GUM_SHA256_ARM64`) et l'installe dans `/usr/local/bin`. Repli texte si : `--no-tui` / `LEKSIS_NO_TUI=1`, pas de TTY, `TERM=dumb`, mode `--yes`, architecture non supportée, échec de téléchargement ou de checksum. **Le script ne doit jamais dépendre de gum.** Pas de `dialog`
- **Toute sortie UI passe par le fd 3** (`/dev/tty`, sinon stderr) — les helpers fonctionnent donc en sous-shell `$(...)` et ne se mélangent pas à la sortie des commandes. Ne jamais faire `echo` / `printf` directement vers le terminal : utiliser `p_header`, `p_info`, `p_ok`, `p_warn`, `p_err`, `p_kv`, `say`
- **Helpers de saisie avec KEY** : `p_input KEY "question" défaut`, `p_yesno KEY "question" y|n`, `p_password KEY "prompt"`, `p_choose KEY "titre" défaut "valeur|Label"…`, `p_multi KEY "titre" "défauts" "valeur|Label"…`. La valeur revient sur **stdout** (`x=$(p_input …)`) ; `p_yesno` renvoie 0/1. **Toute nouvelle question doit avoir une KEY** : `LEKSIS_<KEY>` (env ou fichier `--answers`) y répond sans poser la question ; en mode `--yes` la valeur par défaut est utilisée. Dans une boucle de validation, faire `die` si `$NONINTERACTIVE` et `p_unset_preset KEY` avant de reposer la question (sinon boucle infinie)
- `p_spin "Titre" cmd args…` (spinner gum, sortie → log, affichée seulement en cas d'échec ; **commandes externes uniquement**, gum ne sait pas appeler une fonction shell) et `run_logged cmd…` (sortie à l'écran + `/var/log/leksis-install.log`)
- **Barres de progression** (gum n'en a pas : `draw_bar` maison, redessinée avec `\r` sur le fd 3 ; sans TTY, un jalon tous les 10 %) : `run_with_bar "Titre" layers|steps cmd…` transforme la sortie d'un `docker compose pull` (couches terminées / couches vues) ou `docker compose build` (BuildKit `plain`, étapes `#N [stage i/n]` terminées / vues) en barre — la sortie complète va au log, les 15 dernières lignes ne s'affichent qu'en cas d'échec. `api_pull_with_bar MODEL URL` suit `POST /api/pull` en streaming (octets, vitesse) ; `pull_model` l'utilise en local (via l'IP du conteneur `leksis-ollama`) comme en distant, avec repli sur `ollama pull` en local. Ne jamais mettre `echo $?` après la commande dans le `< <(…)` sous `set -e` : utiliser `cmd && echo 0 >f || echo $? >f`
- **Sélection des modèles** (`ask_ai_models DEF_TRANSLATION [DEF_OCR] [DEF_REWRITE]`, appelée par `cmd_install` et `cmd_config`, pour les 3 modes `local`/`remote`/`openai`) : demande d'abord « Use the same model for translation, OCR and rewrite? » (clé `SAME_MODEL_FOR_ALL`, défaut oui sauf si les modèles existants diffèrent déjà). Si oui, un seul modèle recopié dans les 3 variables ; sinon le **modèle de traduction** est un choix dans une liste (`ask_translation_model` : `translategemma:27b` / `12b` / `4b`, plus le modèle actuel s'il est personnalisé) ou `ask_openai_model` en mode API, et les modèles OCR et réécriture restent en saisie libre, **pré-remplis avec le modèle de traduction choisi**. `sync_ai_config_db` écrit `sameModelForAll` dans `ai_config` seulement si la question a été posée. `OLLAMA_KEEP_ALIVE=-1`, `OLLAMA_SCHED_SPREAD=true` et `OLLAMA_MAX_LOADED_MODELS=3` ne sont **pas demandés à l'installation** (toujours écrits dans `.env`, surchargeables par `LEKSIS_OLLAMA_KEEP_ALIVE` / `LEKSIS_OLLAMA_SCHED_SPREAD` / `LEKSIS_OLLAMA_MAX_LOADED_MODELS`) ; `config` propose de les modifier derrière la question « Edit the Ollama runtime settings ? » (clé `CONFIG_RUNTIME`, valeurs validées par `ask_validated`)
- `set -eEuo pipefail` + `trap ERR` (`on_error`, affiche la ligne fautive ; silencieux pour `exit 130` = annulation utilisateur). Garde stdin non-TTY : refuse `curl … | bash` (sauf `--yes`), exige `bash <(curl …)`
- Doit tourner en **root** (`check_root`, pour toutes les commandes)
- `VERSION` : constante `VERSION="X.Y.Z"` en tête de script, écrasée par `package.json` quand il est présent. `RAW_URL` en est dérivée
- **Fin de fichier : `main "$@"; exit $?` sur UNE seule ligne** — `git checkout` du tag pendant `update` réécrit `install.sh` alors que bash le lit encore ; bash ne doit jamais relire le fichier après `main`. `LEKSIS_SOURCE_ONLY=1` permet de `source` le script pour tester les fonctions

### Options et automatisation

`-y/--yes` (jamais de question), `--answers FILE` (lignes `LEKSIS_<KEY>=valeur`, jamais `source`), `--dir DIR`, `--no-tui`, `-V`, `-h`. Clés : `INSTALL_DIR REPO_URL APP_HOST ADMIN_EMAIL ADMIN_NAME OLLAMA_MODE OLLAMA_URL GPU_VENDOR SAME_MODEL_FOR_ALL OLLAMA_MODEL OLLAMA_OCR_MODEL OLLAMA_REWRITE_MODEL OLLAMA_MAX_LOADED_MODELS POSTGRES_PASSWORD PULL_REMOTE_MODELS UPDATE_COMPONENTS CONFIRM_DELETE CONFIRM_RESTORE …`. Les opérations destructives exigent leur confirmation typée même en `--yes` (`LEKSIS_CONFIRM_DELETE=DELETE`, `LEKSIS_CONFIRM_RESTORE=RESTORE`).

### Commandes disponibles

| Commande | Description |
|----------|-------------|
| `install` | Contrôles système (OS/RAM/CPU) → 5 étapes `Configuration N/5` (chemins · **accès : HTTP / HTTPS domaine / proxy inverse** · compte admin · **Ollama local ou distant** · modèles + mot de passe PostgreSQL) → écran récapitulatif + confirmation → **seulement ensuite** les opérations lourdes (Docker, drivers GPU, clone, `.env`, `docker compose up -d --build`, `wait_healthy`, modèles, admin, test HTTP). Les réponses sont sauvegardées dans `/etc/leksis/install.answers` (chmod 600) avant les opérations lourdes : après le reboot exigé par `nouveau`, relancer propose de **reprendre**. Un `.env` existant conserve ses secrets. À la fin : `/etc/leksis/install.conf` + lanceur `/usr/local/bin/leksis` (petit script `exec bash <INSTALL_DIR>/install.sh`, pas un symlink : indépendant du bit exécutable) |
| `update` | `migrate_env`, `git fetch --tags`, propose le switch de tag, sélection des composants (`p_multi` : `app`, `caddy`, `postgres`, `ollama` si local, `models`), **backup complet avant toute modification**, checkout, puis `docker compose pull` + `up -d` pour les images (caddy/postgres/ollama) et `build --pull` pour `app`. Si `app` n'est pas healthy après un changement de tag → **rollback** proposé (`rollback_app` : `git checkout <sha précédent>` + rebuild) |
| `backup` | `create_backup` → `backups/leksis-backup-<ts>.tar.gz` (chmod 600) : `postgres.sql`, `uploads.tar` (logo/fond, via `exec app tar`), `.env`, `VERSION`. Rotation : `LEKSIS_BACKUP_KEEP` (défaut 7). Écrit aussi `lastBackupAt` dans `site_settings.system_status` (`record_backup_timestamp`, best-effort) pour la carte Backup du dashboard admin. Utilisé aussi par `update`, `uninstall` et `restore` |
| `restore [fichier]` | Accepte `.tar.gz` (ou l'ancien `.sql`). Confirmation typée `RESTORE`, backup de sécurité, arrêt de `app`, `DROP SCHEMA public CASCADE` + rechargement, adopte l'`ENCRYPTION_KEY` du backup si différente (nécessaire pour déchiffrer les identifiants stockés en base), restauration des uploads |
| `uninstall` | Usage disque des volumes, backup optionnel (**copié dans `/var/backups/leksis` avant suppression du dossier**), conserver ou non les volumes, confirmation typée `DELETE`, `docker compose down --remove-orphans --rmi local [-v]`, suppression du dossier, du lanceur `leksis` et de `/etc/leksis/install.conf` |
| `status` | Version installée + canal, URL, test HTTP, `docker compose ps`, mode Ollama (GPU en local, joignabilité en distant), présence de chaque modèle configuré, volumes, backups, 20 dernières lignes de logs `app` |
| `config` | Édite les 3 modèles, le runtime Ollama en local (`keep alive`, `sched spread`, `max loaded models`, derrière une confirmation) ou l'URL (distant), `POSTGRES_VERSION`, et permet de **basculer local ↔ distant**. Synchronise `site_settings.ollama_config` (voir plus bas), recrée `app`, propose de tirer les modèles manquants. Propose aussi de **changer le mode d'accès** (`ask_access` + `apply_access_config`, synchronise l'admin et recharge Caddy). Avertit **sans** redémarrer si `POSTGRES_VERSION` a changé |
| `logs [service]` | `docker compose logs -f` ; la liste des services dépend du mode Ollama |

Sans argument : menu interactif (`show_menu`, chaque commande dans un sous-shell pour revenir au menu en cas d'échec).

### Ollama local ou distant (RÈGLE)

- **3 modes de moteur IA** (variable interne `OLLAMA_MODE`) : `local` (conteneur Ollama), `remote` (serveur Ollama) et **`openai`** (API compatible OpenAI). `.env` : `AI_PROVIDER` (`ollama`|`openai`), `AI_BASE_URL`, `AI_API_KEY` (en clair dans le `.env` chmod 600, masquée dans l'aperçu ; la clé enregistrée par l'admin — chiffrée en base — a priorité), `OLLAMA_BASE_URL` (copie de compatibilité) ; `COMPOSE_PROFILES=ollama` **uniquement** en `local`. Clés de réponse : `AI_MODE` (`local|remote|openai`), `AI_URL`, `AI_API_KEY` (les anciennes `OLLAMA_MODE` / `OLLAMA_URL` restent acceptées via `map_answer_aliases`)
- Mode `openai` : `configure_openai_api` (URL normalisée en `.../v1`, clé via `p_secret`, test `GET /models` avec `openai_models`, avertissement `host_looks_private` si le serveur semble externe — l'app le bloquera tant que « Autoriser les serveurs hors du réseau privé » n'est pas coché dans l'admin) ; les modèles sont les **ids servis** (`ask_openai_model` propose la liste renvoyée par l'API) ; **aucun pull** (`ensure_models` vérifie seulement) ; pas de GPU / drivers / runtime
- `sync_ai_config_db [yes]` remplace `sync_ollama_config_db` : met à jour `site_settings.ai_config` (ou l'ajoute à partir de l'ancienne `ollama_config`) ; `yes` efface aussi la clé chiffrée stockée quand le mode / l'URL / la clé changent, pour que la clé du `.env` s'applique
- `migrate_env` ajoute `AI_PROVIDER=ollama`, `AI_BASE_URL`, `AI_API_KEY=` aux `.env` d'avant la 1.2, et réécrit `AI_PROVIDER=vllm` → `openai` (identifiant des `1.5.0-beta.1/2`, dont le provider vLLM + routage TranslateGemma a été retiré) ; `getAiConfig()` normalise aussi `vllm` → `openai` (base et env)

- **Ollama est un profil compose** (`profiles: ["ollama"]` dans `docker-compose.yml`). `COMPOSE_PROFILES=ollama` dans `.env` = conteneur local ; vide = serveur distant. **Source de vérité du mode : `ollama_local_enabled`** (lit `COMPOSE_PROFILES`). Ne jamais réintroduire un `depends_on: ollama` sans `required: false` (Compose ≥ 2.20, vérifié par `install_docker` via `MIN_COMPOSE_VERSION`) ni coder `OLLAMA_BASE_URL` en dur dans le compose (`${OLLAMA_BASE_URL:-http://ollama:11434}`)
- `app` a `extra_hosts: host.docker.internal:host-gateway` : une URL `localhost`/`127.x` saisie pour un Ollama distant est réécrite en `host.docker.internal` (`OLLAMA_URL` = vue des conteneurs, `OLLAMA_URL_HOSTSIDE` = vue de l'hôte pour les tests curl)
- En mode distant : pas de détection GPU, pas de drivers, pas d'overlay compose, pas de questions de runtime, pas de `wait_healthy ollama`. Les modèles manquants peuvent être tirés via `POST /api/pull` (`stream:false`) après confirmation
- ⚠️ **`site_settings.ollama_config` (admin → Services → AI) prend le pas sur `.env`** dès qu'il a été sauvegardé (`getOllamaConfig`). `sync_ollama_config_db` met à jour ce JSONB (`baseUrl`, modèles) pour que `install.sh config` ait un effet réel
- `migrate_env` (appelé par `require_install`) : un `.env` d'avant cette version sans `COMPOSE_PROFILES` reçoit `ollama` (si `OLLAMA_BASE_URL` est vide ou interne) — sans ça, `update` ne redémarrerait plus le conteneur Ollama. Il garde aussi la garde `POSTGRES_VERSION=16`

### Architecture interne

- **`env_get file key`** lit une clé sans jamais `source` le fichier. **`_env_set key value file`** remplace la clé **ou l'ajoute si elle est absente** (awk + `ENVIRON`, sûr avec `|`, `&`, `/`)
- **`require_install`** : localise l'installation (`--dir` / `LEKSIS_INSTALL_DIR` → `/etc/leksis/install.conf` → `/opt/leksis` → question), `cd` dedans, `migrate_env`, `load_config_from_env`. Toutes les commandes s'exécutent **dans `INSTALL_DIR`** et utilisent `docker compose` nu : `COMPOSE_FILE` / `COMPOSE_PROFILES` / `COMPOSE_PROJECT_NAME` viennent du `.env`
- `COMPOSE_PROJECT_NAME=leksis` est écrit dans le `.env` des nouvelles installations (volumes `leksis_*`). Pour les anciennes, `compose_project` le déduit du label du conteneur `leksis-app` — ne jamais le backfiller (renommerait les volumes = perte de données)
- **`detect_pkg_manager`** → `PKG_MGR` ; **`pkg_install`** (apt/dnf/yum, `apt-get update` une fois)
- **`detect_gpu`** → `GPU_VENDOR` / `GPU_NAME` via 5 sondes (lspci, `nvidia-smi`, `/dev/nvidia0`, `lsmod`, `rocm-smi`) ; **`select_gpu`** ajoute le fallback manuel (réponse `LEKSIS_GPU_VENDOR=nvidia|amd|none`) ; **`resolve_compose_files`** → `COMPOSE_FILE_VALUE` + `OLLAMA_IMAGE` (`docker-compose.nvidia.yml` / `docker-compose.amd.yml` / aucun)
- ⚠️ **Pas de `cmd | grep -q` sous `pipefail`** : `grep -q` ferme le pipe tôt, la commande amont prend SIGPIPE (141) et le test est faussement négatif. Capturer la sortie dans une variable puis `[[ "$var" == *motif* ]]` (voir `has_nvidia_runtime`)
- **`wait_healthy service [timeout]`** — poll `docker inspect … leksis-<service>` toutes les 5 s, échoue tout de suite si le conteneur est `exited`/`dead` (affiche ses derniers logs). **`check_app_http`** teste l'entrée via Caddy (`http://127.0.0.1/`, 2xx/3xx)
- **`list_models` / `model_present` / `pull_model` / `ensure_models`** — fonctionnent en local (`ollama list` dans le conteneur) et en distant (`/api/tags`, `/api/pull`). Les échecs de pull vont dans `FAILED_MODELS` et n'interrompent pas le script
- **`create_admin_user`** et **`sync_ollama_config_db`** passent les valeurs par `psql -v` + `:'var'` sur stdin (jamais d'interpolation shell dans le SQL)
- **Preflight** : `preflight_system` (OS testés, RAM, CPU), `preflight_disk local|remote` (40 / 15 Go), `preflight_network` (DNS du domaine, ports 80/443 — ignorés si `leksis-caddy` tourne déjà)
- **Install drivers GPU** — NVIDIA : driver `.run` + DKMS (version épinglée `NVIDIA_DRIVER_VERSION`, **SHA256 vérifié** via `NVIDIA_DRIVER_SHA256` — à recalculer à chaque changement de version ; blacklist `nouveau` ⇒ reboot requis puis relancer = reprise automatique) + `nvidia-container-toolkit`. AMD : ROCm via `.deb` `amdgpu-install` (codename Ubuntu via `UBUNTU_CODENAME`, fallback `jammy` — paquet Ubuntu utilisé tel quel sur Debian, non validé). **Chemins apt uniquement**
- **OS supportés** (README) : Ubuntu 22.04, Debian 12, Debian 13 (le preflight avertit sans bloquer sur les autres). Docker est installé via `get.docker.com`. Debian 13 n'a pas été testée sur machine réelle, en particulier pour le chemin AMD ROCm
- **Overlays compose GPU** : `docker-compose.nvidia.yml` et `docker-compose.amd.yml` sont sélectionnés par `install.sh` (via `COMPOSE_FILE` dans `.env`) ; `docker-compose.gpu.yml` est un overlay NVIDIA générique utilisable à la main uniquement. Ce sont des **overlays** — à la main, toujours `-f docker-compose.yml -f docker-compose.<x>.yml`
- Aperçu `.env` avant écriture : boucle `while read` qui masque `POSTGRES_PASSWORD` / `AUTH_SECRET` / `ENCRYPTION_KEY` / `DATABASE_URL`

### Règles pour modifier install.sh

- Toujours passer par les helpers `p_*` (jamais `read` / `printf` direct vers le terminal, jamais `dialog`) ; toute question a une KEY
- `set -eEuo pipefail` est actif — garder `|| true` sur les commandes best-effort. ⚠️ Une fonction qui se termine par `[[ … ]] && cmd` renvoie 1 quand le test est faux et fait sortir le script sous `set -e` : terminer par `return 0` ou utiliser `if`
- **Ne jamais modifier les fichiers suivis par git dans `INSTALL_DIR`** (pas de `chmod` sur `install.sh`) : `git checkout <tag>` échouerait ("local changes would be overwritten"). `prepare_checkout` met `core.fileMode=false` et `git stash` les éventuelles modifications locales avant chaque changement de version ; `install.sh` est versionné en mode 755
- Appeler `docker compose` **depuis `INSTALL_DIR`** (déjà le cas après `require_install` / dans `cmd_install` après le clone)
- `cmd_install` : clone frais via `git clone --branch "v${VERSION}"` ; repo existant → `git checkout` du dernier tag du canal
- `cmd_update` est **tag-only** : `git fetch --tags --force` puis `git checkout <latest_tag>` (via `latest_tag`, filtré par canal stable/beta — voir « Canal beta ») — ne suit jamais une branche. Le backup complet précède tout changement ; les services image (`caddy`, `postgres`, `ollama`) doivent être **`pull`és** (`up --build` ne tire pas les images distantes)
- `cmd_logs` : services `app`, `postgres`, `caddy` (+ `ollama` en mode local)
- Tests : `LEKSIS_SOURCE_ONLY=1 source install.sh`, puis fonctions isolées avec de faux `docker` / `curl` dans le `PATH` ; `bash -n install.sh` avant tout commit. Le TUI gum et Docker ne sont pas testables sous Windows — valider sur une VM Linux

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
- Schema DB : `docker/init-schema.sql` — exécuté automatiquement par le container PostgreSQL au premier démarrage
- **Versions Docker** : `postgres` utilise `${POSTGRES_VERSION:-18}-alpine` (configurable via `.env`). `node:22-slim` est épinglé (LTS actuel, Debian requis pour `@napi-rs/canvas`). `caddy:2-alpine` pour le reverse proxy. `ollama/ollama:latest` sans port binding hôte (interne uniquement). Ne jamais hardcoder `postgres:NN-alpine` — toujours passer par la variable. Changer la version majeure PostgreSQL sur une installation existante nécessite une migration de données (`pg_upgrade` ou dump/restore). Le service `postgres` fixe explicitement `PGDATA=/var/lib/postgresql/data` (identique au point de montage du volume) pour désactiver la réorganisation de répertoire style `pg_ctlcluster` introduite dans les builds récents de `postgres:18-alpine` — sans ça, le conteneur refuse de démarrer si le volume contient déjà des données à l'ancien emplacement (erreur "unused mount/volume"). Ne jamais pointer `PGDATA` vers un sous-répertoire (`.../data/pgdata`) : les données existantes sont à la racine du point de montage, un sous-répertoire vide déclencherait un `initdb` silencieux et une perte de données
- **Ollama** : conteneur **optionnel** (profil compose `ollama`, voir « Ollama local ou distant »). Quand il est local, le port `11434` n'est **pas** exposé sur l'hôte — accessible uniquement via le réseau Docker interne (`http://ollama:11434`). Il n'y a plus de pré-chauffage automatique dans `install.sh` — le chargement en VRAM se fait depuis le panneau admin via le bouton "Load into VRAM" (`POST /api/admin/services/ollama/warmup`). La route déduplique les modèles (translationModel / rewriteModel / ocrModel) et appelle Ollama avec `keep_alive: -1` pour chacun. Le téléchargement de nouveaux modèles se fait directement depuis les sélecteurs `OllamaModelSelect` de l'onglet Models (« Télécharger et utiliser », `POST /api/admin/services/ollama/pull`) qui stream le JSON de progression d'Ollama ligne par ligne — plus de bloc de téléchargement séparé. La suppression se fait via `DELETE /api/admin/services/ollama/delete` (onglet Monitoring) — les modèles référencés dans la config ont leur corbeille désactivée
- **Accès / Caddy** (une seule notion : le **mode d'accès**) : `http` (`:80`, HTTP simple sur l'IP), `https` (domaine → Let's Encrypt automatique, + option `keepHttpFallback` = bloc `:80` de secours par IP pendant la mise en place) ou `proxy` (`:80` derrière NPM/Traefik qui gère le HTTPS). Config `site_settings.caddy_config` = `{ mode, host, keepHttpFallback, trustedProxies, behindProxy }` (`behindProxy` = `mode === 'proxy'`, gardé pour l'ancien format). **`src/lib/caddy-config.ts` (client-safe, partagé)** : `resolveCaddyConfig()` (rétrocompatible : ancien `{ host, behindProxy }` → domaine = https, sinon proxy/http ; sans rien en base l'état vient de `CADDY_HOST`, passé à l'app par le compose), `normalizeCaddyConfig()` (valide le domaine — une IP est refusée —, nettoie `trustedProxies`), `generateCaddyfile()` (aussi utilisée par l'aperçu du formulaire). `src/lib/caddy.ts` (server-only) ne garde que `reloadCaddy()` + ré-exports. ⚠️ **`caddyfile_content()` d'`install.sh` génère le même Caddyfile : toute modification de `generateCaddyfile()` doit être répliquée** (et inversement)
- **Adresse publique détectée, plus de `NEXTAUTH_URL`** : `auth.config.ts` a `trustHost: true` (donc `AUTH_TRUST_HOST` est inutile — supprimé de `.env`) et **Auth.js réécrit l'origine de chaque requête avec `NEXTAUTH_URL`/`AUTH_URL` s'ils sont définis** (`reqWithEnvURL`) : le compose passe `NEXTAUTH_URL: ${NEXTAUTH_URL:-}` (vide par défaut) pour que l'adresse vienne des en-têtes `Host` / `X-Forwarded-*`. Les installs existantes gardent leur valeur ; `leksis config` (changement d'accès) la vide. L'ancien champ `nextauthUrl` de l'admin ne faisait rien (jamais lu) : supprimé **Migration** : `migrate_pinned_url` (appelée par `cmd_update`) vide un `NEXTAUTH_URL` en `http(s)://<IPv4>` (ancien défaut de l'installeur : renvoie vers l'IP même via un domaine/proxy) puis relance `app` ; une valeur en domaine est laissée, `leksis config` propose de la supprimer (`clear_pinned_url`). L'admin Caddy affiche un avertissement (`PinnedUrlNotice`) tant que `process.env.NEXTAUTH_URL` est défini — l'admin ne peut pas la vider (variable d'environnement du conteneur) **Piège** : le serveur Next standalone tourne avec `HOSTNAME=0.0.0.0` (Dockerfile) et `PORT=3000` : sans `NEXTAUTH_URL`, le proxy (middleware) construit `callbackUrl` avec l'adresse INTERNE (`http://0.0.0.0:3000/…`). `SignInForm` n'utilise donc que le **chemin** de `callbackUrl` (`safeCallbackPath`, relatif à `window.location.origin` — protège aussi d'une redirection vers un autre site). Ne jamais rediriger vers un `callbackUrl` absolu
- **Proxys de confiance** : le Caddyfile déclare `servers { trusted_proxies static private_ranges [+ trustedProxies] }` dans **tous** les modes — Caddy transmet alors les `X-Forwarded-*` d'un proxy du réseau privé (ou listé) à l'app. Plus de `header_up X-Forwarded-*` (un placeholder vide écrasait l'en-tête avec une chaîne vide). Le `docker/caddy/Caddyfile` statique porte le même bloc `servers`
- **Passage HTTP → HTTPS** : Admin → Services → Caddy (formulaire `CaddyServiceForm` : 3 cartes de mode, domaine, secours HTTP, adresses de proxy, aperçu du Caddyfile) ou `leksis config` → « Change how users reach Leksis ». `PATCH /api/admin/services` (`service: 'caddy'`) enregistre puis recharge Caddy à chaud (`POST http://caddy:2019/load`) ; échec → `{ ok: true, reloadError }` sans faire échouer la requête. `GET /api/admin/services/caddy/metrics` ajoute `mode`, `domain` et `tls` (`checkCertificate()` de `src/lib/caddy-tls.ts` : connexion TLS à `caddy:443` avec le domaine en SNI, émetteur/expiration, `ok` = certificat de confiance) ; `CaddyMetrics` affiche le bloc « Accès » et re-vérifie toutes les 5 s (3 min max) après un enregistrement (événement `leksis:caddy-saved` émis par le formulaire)
- **`install.sh`** : étape 2 « Access » (`ask_access`) → `http|https|proxy` ; `apply_access_config` (fin d'install et de `config`) écrit `caddy_config` en base (`psql -v` + `:'var'`) **et** recharge Caddy via `docker compose exec -T caddy sh -c 'cat >/tmp/Caddyfile && caddy reload --config /tmp/Caddyfile --adapter caddyfile --address localhost:2019 --force'` (le `.env` `CADDY_HOST` seul ne suffit pas : Caddy démarre avec `--resume` et l'`autosave.json` du volume prime sur le Caddyfile). `current_access` relit l'état (base, sinon déduit de `CADDY_HOST`). Clés de réponse : `ACCESS_MODE`, `APP_HOST` (domaine en https ; un `APP_HOST` domaine sans `ACCESS_MODE` implique https), `ACCESS_FALLBACK`, `ACCESS_TRUSTED`. Caddy conserve la config chargée à chaud au redémarrage, mais les installs existantes gardent leur `autosave.json` jusqu'au prochain enregistrement d'accès
- Divers Caddy : l'admin API écoute sur `0.0.0.0:2019` (interne Docker uniquement). `GET /` retourne 404 en Caddy v2 — utiliser `GET /config/` pour vérifier la joignabilité. **Version Caddy** : l'API admin ne la retourne pas — l'extraire du header `Server` sur le port proxy (`HEAD http://caddy:80/`) : pattern `Caddy/?([\d.]+)` → numéro si présent, sinon `'Caddy'`. `GET /api/admin/services` retourne `{ ai, db, caddy }`
- **`headerLogoSize`** : de même déplacé depuis `site_settings.design` vers `site_settings.branding` (repli identique côté lecture), champ dans `BrandingForm` juste sous l'upload du logo
- **Tonalité par défaut** : `site_settings.features.defaults.formality` (`'Informal' | 'Formal'`, défaut `'Informal'`) — pré-remplit `TextTranslationTab` (prop `defaultFormality`, remonté via `page.tsx` → `HomeClient`). Réglage dans `FeaturesForm` (section Défauts, à côté des langues par défaut)
- **Fond du site** : `BrandingForm` a un toggle Couleur/Image (state local `bgMode`, non persisté) — un seul des deux champs est affiché à la fois ; passer en mode Couleur alors qu'une image est déjà enregistrée la supprime immédiatement (`handleBgRemove`) pour qu'il n'y ait jamais les deux en même temps
- **Dashboard admin** : `/admin/dashboard` — server component qui interroge directement la DB via `query()` (même pattern que les autres pages admin). Tables : `users` (count), `usage_log` (count WHERE created_at >= CURRENT_DATE), sous-requête `glossary_entries` GROUP BY glossary_id pour le total, `audit_log ORDER BY created_at DESC LIMIT 5`, tendance 7 jours zero-filled (`generate_series` + LEFT JOIN sur `usage_log`) et répartition par `feature` sur la même fenêtre, `site_settings.system_status.lastBackupAt` (voir plus bas) pour la carte Backup. Les données de santé service (Ollama/DB/Caddy) sont fetchées côté client dans `AdminDashboard.tsx` via les 3 routes `/api/admin/services/*/metrics`. `/admin/page.tsx` redirige vers `/admin/dashboard`
- **`site_settings.system_status`** : clé JSONB interne (hors schéma Zod de `PATCH /api/admin/settings`, jamais éditable depuis l'UI) écrite uniquement par `install.sh` (`record_backup_timestamp`, appelée à la fin de `create_backup`) via `psql -v` + `:'var'`. Contient `lastBackupAt` (ISO 8601 UTC) — la carte Backup du dashboard **et** la carte « Full server backup » d'`ExportImportForm` la lisent pour afficher « il y a X » et passer au rouge au-delà de 8 jours ou en l'absence de sauvegarde
- **Deux mécanismes de sauvegarde distincts, volontairement pas fusionnés** : `leksis backup` (console) fait un `pg_dump` complet + `uploads.tar` + `.env` (secrets en clair) — c'est la seule sauvegarde compatible avec `leksis restore`. L'export JSON d'Admin → Backup (`/api/admin/settings/export`) ne contient que `site_settings` (branding/design/features/tons/général, secrets retirés) + glossaires + logo/fond (embarqués en base64, cf. `readAsset`/`writeAsset`) — jamais `users`/`sessions`/`audit_log`/`usage_log`, jamais de secret. **Ne pas faire converger les deux** : répliquer le `.env` (mot de passe PostgreSQL, `AUTH_SECRET`, `ENCRYPTION_KEY`) dans un fichier téléchargeable depuis le navigateur élargirait la surface d'attaque (n'importe quelle session admin navigateur vs accès SSH/console requis pour la CLI). `ExportImportForm.tsx` explicite cette distinction à l'utilisateur plutôt que de la masquer
- **`AdminSidebar.tsx`** : navigation plate avec `useServiceStatus()` hook — fetch parallèle des 3 endpoints metrics au mount, `reachable` ou `ok` selon le service. `StatusDot` : vert `bg-[#27ae60]` si `true`, rouge `bg-error` si `false`, gris si `null` (chargement). Section labels : `SETTINGS` / `INFRASTRUCTURE` / `MANAGEMENT`. `SettingsAccordion.tsx` supprimé — remplacé par `SettingsTabs.tsx`
- **Aucun CDN tiers** : Material Symbols et Bootstrap Icons sont self-hébergés. Ne pas réintroduire de `<link>` vers `fonts.googleapis.com` ou `cdn.jsdelivr.net`. Pour mettre à jour Material Symbols, re-télécharger le woff2 depuis `fonts.gstatic.com` (URL versionnée `v{N}`)
- Priorité : robustesse, lisibilité, maintenabilité
- Les messages de commit git doivent toujours être **en anglais**

---

## 🚀 Releases GitHub

- Dépôt : `https://github.com/Mandrhax/Leksis`
- Stratégie de tags : **semver préfixé** — `v1.0.0`, `v1.1.0`, `v2.0.0`
- `install.sh` clone toujours sur le tag épinglé (`--branch "v${VERSION}"`) — les utilisateurs installés sur une version sont **isolés de `main`** jusqu'à la prochaine release
- `cmd_update` est **tag-only** : toujours `git fetch --tags --force` + `git checkout <latest_tag>` — ne suit jamais une branche, pas de fallback `main`

### Workflow release

1. Bumper **trois fichiers** :
   - `package.json` → `"version": "X.Y.Z"`
   - `install.sh` → `VERSION="X.Y.Z"` (ligne ~24) **et** l'URL `raw.githubusercontent.com` du commentaire d'en-tête (ligne ~19) — les autres URLs sont dérivées de `VERSION` (`RAW_URL`)
   - `README.md` → l'URL du one-liner (`…/Leksis/vX.Y.Z/install.sh`) et une entrée « What's new » pour la version
2. Commit et push sur `main` :
   ```bash
   git add package.json install.sh README.md
   git commit -m "chore(release): prepare vX.Y.Z"
   git push origin main
   ```
3. Créer et pusher le tag :
   ```bash
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```
4. Publier la GitHub Release (`gh` CLI installé, token via git credential store) :
   ```bash
   export PATH="$PATH:/c/Program Files/GitHub CLI"
   TOKEN=$(printf 'protocol=https\nhost=github.com\n' | git credential fill | grep password | cut -d= -f2)
   GH_TOKEN="$TOKEN" gh release create vX.Y.Z --title "Leksis vX.Y.Z" --notes "..."
   ```

### Règles
- Ne jamais bumper la version dans un seul fichier sans les autres (`package.json`, `install.sh`, `README.md`)
- Le README étant lu depuis `main`, un README commité après le tag n'est pas dans le tag : il sera embarqué à la release suivante
- Si un hotfix doit corriger le tag avant toute installation réelle : `git tag -f vX.Y.Z && git push origin vX.Y.Z --force`
- Le développement courant se fait sur `main` sans impact sur les utilisateurs installés (sauf pour les évolutions lourdes : voir ci-dessous)

### Canal beta (versions de test)

- **`main` = stable uniquement.** Les évolutions lourdes se font sur la branche `dev` (ou des sous-branches `feature/*` mergées dans `dev`). Un hotfix fait sur `main` est ensuite reporté avec `git switch dev && git merge main`
- **Versions de test = tags pré-release semver** posés sur `dev` : `v1.1.0-beta.1`, `-beta.2`, … Bumper les 3 fichiers (`package.json`, `install.sh`, `README.md`) vers `X.Y.Z-beta.N` comme pour une release stable, puis `git tag vX.Y.Z-beta.N && git push origin vX.Y.Z-beta.N` et `gh release create vX.Y.Z-beta.N --prerelease`
- Installation de test : le même one-liner que le stable, avec l'URL du tag beta (`…/Leksis/vX.Y.Z-beta.N/install.sh`)
- **Canaux dans `install.sh`** : `detect_channel <tag>` renvoie `beta` si le tag courant contient un `-` (ou si `LEKSIS_CHANNEL=beta`), sinon `stable`. `latest_tag <dir> <canal>` renvoie le plus haut tag semver du canal (tri `versionsort.suffix=-` : `v1.1.0` > `v1.1.0-beta.2`). Une installation stable **ne voit jamais** les pré-releases ; une installation beta suit les betas puis la release stable suivante. Ne jamais réintroduire `git describe … rev-list --tags` pour choisir la dernière version
- **Publier la stable** : quand la beta est validée, merger `dev` → `main`, bumper vers `X.Y.Z` (sans suffixe) et suivre le workflow release ci-dessus
- **Environnement de test** : utiliser une machine/VM séparée (`container_name: leksis-*` et ports 80/443 sont fixes). `docker/init-schema.sql` ne s'exécute qu'au premier démarrage du volume : toute évolution de schéma sur une installation existante demande une migration — ne jamais tester une beta sur la production

---

Fin du document.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
