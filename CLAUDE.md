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
- Material Symbols (icons via CDN Google Fonts)
- Bootstrap Icons (icônes fichiers dans Document Studio via CDN)
- **next-auth v5** (authentification OTP par email — `src/auth.ts`, `src/auth.config.ts`, `src/middleware.ts`)
- **pg** + **@auth/pg-adapter** (PostgreSQL — pool, sessions, utilisateurs)
- **zod** (validation des entrées dans les routes API admin)
- **@napi-rs/canvas** (conversion PDF → PNG pour l'OCR vision)
- **server-only** (protection des modules serveur)
- À terme : Docker / Docker Compose (appliance)

---

## 🏗️ Architecture (RÈGLE ABSOLUE)

Flux de données :

```
Client React
→ API Next.js (Gateway IA)  /api/*
→ Ollama  /api/generate
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
│   │   └── admin/
│   │       ├── audit/route.ts           (Journal d'audit paginé)
│   │       ├── audit/purge/route.ts     (Suppression entrées avant date)
│   │       ├── background/route.ts      (Mise à jour image de fond)
│   │       ├── logo/route.ts            (Upload/suppression du logo)
│   │       ├── services/route.ts        (Config Ollama + PostgreSQL GET/PATCH)
│   │       ├── services/ollama/test/route.ts    (Test connexion Ollama)
│   │       ├── services/ollama/metrics/route.ts (Métriques Ollama : version, latence, modèles, running)
│   │       ├── services/ollama/unload/route.ts  (Décharge un modèle — keep_alive: 0)
│   │       ├── services/db/test/route.ts        (Test connexion PostgreSQL)
│   │       ├── services/db/metrics/route.ts     (Métriques PostgreSQL : version, taille, connexions, tables)
│   │       ├── settings/route.ts        (Réglages site GET/PATCH)
│   │       ├── settings/export/route.ts (Export config JSON)
│   │       ├── settings/import/route.ts (Import config JSON)
│   │       ├── settings/reset/route.ts  (Réinitialisation aux défauts)
│   │       ├── usage/route.ts           (Stats d'utilisation IA)
│   │       ├── usage/purge/route.ts     (Suppression stats avant date)
│   │       ├── users/route.ts           (Liste utilisateurs)
│   │       └── users/[id]/route.ts      (Mise à jour rôle utilisateur)
│   ├── admin/
│   │   ├── layout.tsx                   (requireAdmin + AdminClientLayout + AdminSidebar)
│   │   ├── settings/page.tsx            (AdminPageHeader + SettingsTabs — max-w-[1400px])
│   │   ├── services/page.tsx            (redirect → /admin/services/ai)
│   │   ├── services/ai/page.tsx         (AdminPageHeader "servicesAi" + grille [2fr_3fr] : ServicesPanel | OllamaMetrics)
│   │   ├── services/db/page.tsx         (AdminPageHeader "servicesDb" + grille [2fr_3fr] : ServicesPanel | DbMetrics)
│   │   ├── users/page.tsx               (AdminPageHeader + UserList)
│   │   ├── usage/page.tsx               (AdminPageHeader + UsagePanel)
│   │   ├── audit/page.tsx               (AdminPageHeader + AuditTable)
│   │   └── backup/page.tsx              (AdminPageHeader + ExportImportForm)
│   ├── auth/
│   │   └── signin/page.tsx              (I18nProvider + UILanguageSwitcher + formulaire OTP)
│   ├── maintenance/
│   │   └── page.tsx                     (Page maintenance — affichée si maintenanceMode actif)
│   ├── settings/
│   │   └── page.tsx                     (I18nProvider + profil + session)
│   ├── globals.css                      (Tailwind v4 @theme + classes CSS custom)
│   ├── layout.tsx                       (Fonts, Material Symbols, Bootstrap Icons CDN)
│   └── page.tsx                         (Workspace — tabs centrés)
│
├── components/
│   ├── GlobalBanner.tsx                 (Bannière globale — affichée si globalBanner configuré)
│   ├── tabs/
│   │   ├── TextTranslationTab.tsx       (Debounce 400ms detect + 800ms translate, swap, formality)
│   │   ├── DocumentStudioTab.tsx        (Upload → extract → translate → blocks HTML)
│   │   ├── ImageExtractionTab.tsx       (OCR + traduction optionnelle, stats)
│   │   └── AIRewriteTab.tsx             (Modes rewrite/correct, tons configurables, length)
│   ├── ui/
│   │   ├── HomeClient.tsx               (I18nProvider wrapper + HomeWorkspace interne)
│   │   ├── AccountMenu.tsx              (Menu utilisateur — positionné par HomeClient)
│   │   ├── UILanguageSwitcher.tsx       (Switcher EN/DE/FR/IT avec drapeaux SVG inline)
│   │   ├── LanguageDropdown.tsx         (Liste alphabétique unifiée, favoris, portal fixe)
│   │   └── GlossaryPanel.tsx            (Slide-in, add/remove/import/export CSV)
│   └── admin/
│       ├── AdminClientLayout.tsx        (Fournit I18nProvider aux composants admin)
│       ├── AdminPageHeader.tsx          (Titre + description traduits, section= : settings|servicesAi|servicesDb|users|usage|audit|backup)
│       ├── AdminSidebar.tsx             (Navigation admin — Settings, Services [en-tête] > AI + Database, Users, Usage, Audit, Backup)
│       ├── AdminToast.tsx               (Composant toast + type ToastState)
│       ├── AdminToastWrapper.tsx        (Wrapper de positionnement du toast)
│       ├── SettingsTabs.tsx             (Onglets Identité/Interface/Fonctionnalités/Tonalités/Accès — sous-blocs en grille lg:grid-cols-2)
│       ├── BrandingForm.tsx             (Logo, couleurs, fond, mode sombre — sous-blocs en grille)
│       ├── DesignForm.tsx               (Radius boutons, taille logo, footer — sous-blocs en grille)
│       ├── FeaturesForm.tsx             (Modules actifs, langues défaut, limites API — sous-blocs en grille)
│       ├── TonesForm.tsx                (CRUD tonalités : label EN/FR/DE/IT, instruction prompt, on/off, min 1 / max 6)
│       ├── GeneralForm.tsx              (Email contact, bannière, mode maintenance — sous-blocs en grille)
│       ├── ExportImportForm.tsx         (Export/Import configuration JSON)
│       ├── ServicesPanel.tsx            (Client wrapper pour OllamaServiceForm ou DbServiceForm selon mode="ai"|"db")
│       ├── OllamaServiceForm.tsx        (Config Ollama, test connexion)
│       ├── DbServiceForm.tsx            (Config PostgreSQL, test connexion)
│       ├── OllamaMetrics.tsx            (Métriques Ollama live : statut, modèles installés, modèles en mémoire + Unload)
│       ├── DbMetrics.tsx                (Métriques PostgreSQL live : statut serveur, connexions, tables application)
│       ├── UserList.tsx                 (Tableau utilisateurs, toggle rôle admin)
│       ├── UsagePanel.tsx               (Stats IA filtrées par date, export CSV)
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
│   ├── ollama.ts                        (SERVER-ONLY: streamOllamaResponse, callOllama, getOllamaConfig)
│   ├── prompts.ts                       (Factory prompts: translate, document, ocr, rewrite, correct)
│   ├── tones.ts                         (SERVER-ONLY: DEFAULT_TONES, getConfiguredTones — fallback + migration DB)
│   ├── file-parser.ts                   (SERVER-ONLY: parsePdf, parseDocx, parseTxt, Block model)
│   ├── pdf-vision.ts                    (SERVER-ONLY: parsePdfWithVision — OCR via Ollama vision)
│   ├── validators.ts                    (Limites: text=5000, doc=12000, image=10MB + validateFileExtension)
│   ├── languages.ts                     (LANGUAGES[] triés BCP47 + detectLanguage())
│   ├── glossary.ts                      (buildTranslationGlossaryClause, buildRewriteGlossaryClause, CSV)
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
    ├── leksis.ts                        (Language, Block, Formality, RewriteTone, RewriteLength, ToneConfig, etc.)
    └── next-auth.d.ts                   (Extension Session + JWT pour next-auth)
```

---

## 🌍 Internationalisation (i18n)

L'interface est entièrement traduite en **Anglais (EN), Allemand (DE), Français (FR) et Italien (IT)**.

### Architecture

- **Zéro dépendance** : contexte React custom (`src/lib/i18n.tsx`) en ~50 lignes
- Préférence persistée dans `localStorage` (clé : `leksisUILocale`)
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
| Page signin | `SignInPage` wraps `I18nProvider` → `SignInForm` |

### Espaces de noms définis

`home`, `account`, `textTab`, `docTab`, `imgTab`, `rewriteTab`, `langDropdown`, `glossary`, `langSwitcher`, `settingsPage`, `adminSidebar`, `adminPages`, `settingsTabs`, `brandingForm`, `designForm`, `featuresForm`, `tonesForm`, `generalForm`, `ollamaForm`, `dbForm`, `userList`, `usagePanel`, `auditTable`, `purgeButton`, `backupForm`, `signIn`

---

## 🎨 UI / Design

### Layout

- Header : barre de tabs centrée — à droite, un wrapper flex `absolute right-4` contient `UILanguageSwitcher` + `AccountMenu`
- Workspace : `max-w-[1440px]`, `px-6 md:px-8`, `pt-6`
- Footer 3 colonnes : Privacy / Precision / Editorial

### Pages admin — conventions de mise en page

- Wrapper page : `p-8 max-w-[1400px]`
- **Pages Services AI & DB** : grille `grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6 items-start` — formulaire config à gauche, blocs métriques à droite
- **Page Réglages** : tabs de navigation (5 onglets), sous-blocs de chaque formulaire en `grid grid-cols-1 lg:grid-cols-2 gap-6 items-start`, bouton Save hors grille
- **Style de carte admin** : `bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6` — utilisé uniformément pour formulaires et blocs métriques
- **Blocs métriques** (OllamaMetrics, DbMetrics) : bouton Refresh dans l'en-tête du bloc Statut, blocs 2 et 3 côte à côte (`xl:grid-cols-2`)

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
- Admin protégé par `requireAdmin()` dans chaque page et route admin
- Logs d'audit fire-and-forget via `src/lib/audit.ts`

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
- Tout nouveau namespace i18n doit être ajouté dans les **4 fichiers** (`en.ts`, `de.ts`, `fr.ts`, `it.ts`) simultanément
- Les valeurs envoyées à l'API (id de ton, longueurs, features) restent des slugs stables — seul l'affichage est traduit via `labels[locale]`
- Les tons de réécriture sont dans `site_settings` (clé `rewrite_tones`, JSONB array). `src/lib/tones.ts` gère les défauts et la migration backward compat (`label: string` → `labels: { en }`)
- `ToneConfig.labels` : `en` requis, `fr`, `de` et `it` optionnels avec fallback sur `en`
- Priorité : robustesse, lisibilité, maintenabilité
- Les messages de commit git doivent toujours être **en anglais**

---

Fin du document.
