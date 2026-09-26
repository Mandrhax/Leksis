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

- Next.js 16 (App Router), TypeScript, React 19 — API server-side intégrée (Backend-for-Frontend)
- Moteur IA : Ollama (`/api/generate`) **ou** API compatible OpenAI (`/v1/chat/completions` — vLLM, LM Studio, llama.cpp, OpenAI…), local ou distant
- Tailwind CSS v4 (configuration CSS-first avec `@theme`) ; fonts Manrope (headlines) + Inter (body) via `next/font/google`
- Material Symbols Outlined : **self-hébergé** — woff2 dans `public/fonts/material-symbols/`, `@font-face` + classe `.material-symbols-outlined` dans `globals.css`. Bootstrap Icons (icônes fichiers du Document Studio) : **self-hébergé** via le paquet npm `bootstrap-icons`, importé dans `layout.tsx`
- **next-auth v5** — authentification OTP par email, sessions **JWT sans adaptateur** (`src/auth.ts`, `src/auth.config.ts`, `src/proxy.ts` — le « middleware » de Next 16)
- **pg** (PostgreSQL, `src/lib/db.ts`), **zod** (validation), **@napi-rs/canvas** (PDF → PNG pour l'OCR), **server-only**
- **Caddy v2** (reverse proxy, container `caddy:2-alpine`, ports 80/443, admin API interne sur `0.0.0.0:2019`) ; Docker / Docker Compose (appliance on-premise)
- Qualité : **ESLint** (`eslint-config-next`), **Vitest** (tests unitaires), **puppeteer-core** + **PGlite** (test de bout en bout), **GitHub Actions** — voir « Développement, qualité et tests »

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
├── auth.ts / auth.config.ts   NextAuth : provider Credentials (OTP), JWT, rôle relu en base (voir « Comptes et sessions »)
├── proxy.ts                   Protection des routes (redirige vers /auth/signin) — remplace middleware.ts (Next 16)
├── instrumentation.ts         Démarre le nettoyage des journaux au lancement du serveur
│
├── app/
│   ├── page.tsx, layout.tsx, globals.css, settings/page.tsx, auth/signin/page.tsx
│   ├── api/
│   │   ├── translate/route.ts            Traduction texte (streaming)
│   │   ├── translate/document/route.ts   Traduction document (JSON blocks, par lots — voir « Documents »)
│   │   ├── rewrite/route.ts              Réécriture (streaming)
│   │   ├── ocr/route.ts                  OCR image (streaming)
│   │   ├── extract/document/route.ts     Extraction sans traduction
│   │   ├── export/docx/route.ts          Export du résultat en DOCX
│   │   ├── site-assets/[filename]/       Sert logo et fond (CSP sandbox + nosniff)
│   │   ├── auth/otp/route.ts, auth/[...nextauth]/route.ts
│   │   ├── user/glossary-prefs/route.ts  Préférences glossaires de l'utilisateur
│   │   └── admin/                        audit(+purge), background, logo, glossary/**, usage(+purge), users(+[id]),
│   │                                     settings(+export/import/reset), services (+ai/test|metrics, ollama/pull|delete|warmup|unload,
│   │                                     db/metrics, caddy/metrics)
│   ├── admin/                            layout (requireAdmin) + dashboard, settings, services/{ai,db,caddy}, glossary, users, usage, audit, backup
│
├── components/
│   ├── GlobalBanner.tsx, MaintenanceScreen.tsx
│   ├── tabs/    TextTranslationTab, DocumentStudioTab, ImageExtractionTab, AIRewriteTab
│   ├── ui/      HomeClient, AccountMenu, SignInForm, UILanguageSwitcher, LanguageDropdown, HelpModal
│   └── admin/   AdminClientLayout, AdminSidebar, AdminPageHeader, AdminToast, ServiceTabBar, SettingsTabs, AdminDashboard,
│                *Form (Branding, Design, Features, Tones, General, AiService, CaddyService, ExportImport), OllamaModelSelect,
│                *ServicesLayout (Ollama, Caddy), *Metrics (Ollama, Db, Caddy), GlossaryAdmin, UserList, UsagePanel, AuditTable, PurgeButton, PinnedUrlNotice
│
├── hooks/       useCopyToClipboard, useOllamaPull
├── locales/     en.ts (source du type Messages), de.ts, fr.ts, it.ts (`satisfies Messages`)
│
├── lib/
│   ├── llm/                 SERVER-ONLY (sauf types.ts) : providers Ollama / OpenAI, config, service, network — point d'entrée `@/lib/llm`
│   ├── prompts.ts           Tous les prompts
│   ├── file-parser.ts       PDF / DOCX / TXT / CSV → blocs ; blocksToSegments / applySegments
│   ├── doc-translate.ts     Lots de segments + contrôle des `|||` (pur, testable)
│   ├── pdf-vision.ts        PDF scanné → OCR par le modèle vision
│   ├── settings.ts          getSetting (cache 5 s) / updateSetting / getAllSettings
│   ├── settings-schema.ts   Schémas zod des réglages + SETTING_DEFAULTS (partagé PATCH / import / reset / formulaires)
│   ├── users.ts             Rôle relu en base, liste paginée, changeUser / removeUser (garde-fous)
│   ├── user-guard.ts        requireUser() : 401, mode maintenance, limite de débit
│   ├── admin-guard.ts       requireAdmin() / getAdminSession()
│   ├── rate-limit.ts, otp.ts, audit.ts, usage.ts, retention.ts
│   ├── site-assets.ts       Upload logo / fond : magic bytes, taille, erreurs à code
│   ├── caddy-config.ts (client-safe), caddy.ts, caddy-tls.ts
│   ├── glossary.ts, tones.ts, limits.ts, features-guard.ts, validators.ts, languages.ts, i18n.tsx, sign-out.ts, crypto.ts, db.ts, color-utils.ts, relative-time.ts
│
└── types/       leksis.ts, next-auth.d.ts

docker/          init-schema.sql (installation neuve), migrations/NNN-*.sql (installations existantes), caddy/Caddyfile
tests/           unit/*.test.ts (Vitest), e2e/journeys.mjs (navigateur réel), stubs/server-only.ts
.github/workflows/ci.yml
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

### Espaces de noms

Un namespace par composant ou page (`home`, `textTab`, `docTab`, `imgTab`, `rewriteTab`, `signIn`, `maintenance`, `adminSidebar`, `settingsTabs`, `generalForm`, `userList`, `auditTable`…) : la liste exacte est dans `en.ts`, source du type `Messages`.

---

## 🎨 UI / Design

### Layout

- Header : barre de tabs centrée — à droite, un wrapper flex `absolute right-4` contient `UILanguageSwitcher` + `AccountMenu`
- Workspace : `max-w-[1440px]`, `px-6 md:px-8`, `pt-6`
- Footer 3 colonnes : Privacy / Precision / Editorial

### Pages admin — conventions de mise en page

- Wrapper page : `p-8 max-w-[1400px]`
- **Pages Services (Ollama/Caddy) et Réglages** utilisent le même pattern d'onglets soulignés via le composant partagé `ServiceTabBar` (générique `<T extends string>`, style `.tab-btn` du workspace principal) — plus de grille 2 colonnes ni d'accordéon. Ollama : Connection/Models/Monitoring. Caddy : Access/Monitoring. **PostgreSQL : Monitoring seul** (le formulaire de connexion a été supprimé, la connexion vient de `DATABASE_URL`). Réglages (`SettingsTabs`) : Identity/Appearance/Features & limits/AI tones/General
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
- Précédence : `ai_config` (base) → `ollama_config` (ancienne clé, lecture seule) → variables d'environnement `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY` ; les 3 modèles sont `AI_MODEL` / `AI_OCR_MODEL` / `AI_REWRITE_MODEL` (quel que soit le fournisseur). Les anciens noms `OLLAMA_BASE_URL` / `OLLAMA_MODEL` / `OLLAMA_OCR_MODEL` / `OLLAMA_REWRITE_MODEL` (avant 1.5.1) sont encore lus en repli par `config.ts` et le compose, et renommés dans le `.env` par `migrate_env` (tests : `tests/unit/llm-config.test.ts`). Les `OLLAMA_*` restants (`KEEP_ALIVE`, `SCHED_SPREAD`, `MAX_LOADED_MODELS`, `IMAGE`, `HOST`) sont de vrais réglages du conteneur Ollama : ne pas les renommer. La clé enregistrée ne suit pas un changement d'URL/fournisseur (PATCH et test)
- **Serveurs externes bloqués par défaut** : tant que `allowExternal` n'est pas coché (Admin → Services → AI : « Autoriser les serveurs hors du réseau privé »), toute requête vers un hôte hors réseau privé est refusée (403 `external_blocked`) et la sauvegarde d'une telle URL est rejetée. Les textes des utilisateurs quittent alors le réseau : c'est un choix explicite de l'admin
- Capacités (`capabilities`) : seul Ollama sait `pull`, `delete`, `warmup` (VRAM), `unload`, `running`. Les routes `services/ollama/{pull,delete,warmup,unload}` répondent 400 pour un autre fournisseur ; l'UI masque ces blocs

### Choix du moteur dans l'admin (Services → AI)

Trois cartes : **Ollama (ce serveur)**, **Ollama (autre serveur)**, **API compatible OpenAI**. Seuls `provider` et `baseUrl` sont enregistrés : le mode se déduit (`aiModeOf()` dans `llm/types.ts` — Ollama + `http://ollama:11434` = local). « Local » verrouille l'adresse (`LOCAL_OLLAMA_URL`) et masque la case « hors réseau privé ». La carte locale est grisée si le conteneur ne répond pas (`GET /api/admin/services/ai/local`, sans audit — `ai/test` en écrit un à chaque appel) : il ne se crée pas depuis l'admin, seulement à l'installation ou par `leksis config`.

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

- Séparation stricte client / serveur ; aucun secret ni logique IA côté client
- **Toute route API réservée aux utilisateurs** commence par `requireUser({ rateLimit: true })` (`user-guard.ts`) : 401 JSON sans session, 503 `maintenance` pour les non-admins en mode maintenance, limite de débit par utilisateur (Admin → Réglages → Features & limits, 0 = illimité). Le proxy (`proxy.ts`) filtre déjà les anonymes : le garde est la défense en profondeur. `/api/auth/otp` a sa propre limite (par IP et par email)
- **Toute page et route admin** commence par `requireAdmin()` / `getAdminSession()`
- Entrées : `validators.ts` (tailles, extensions, noms de langue avant les prompts) + zod. Plafonds de taille **avant** de lire le corps (`requestTooLarge`) ; Caddy limite aussi le corps (`max_size 50MB`)
- **Erreurs d'API** : messages en anglais, jamais `err.message` renvoyé au client (journalisé côté serveur). Quand l'interface doit afficher un texte, la route renvoie un `code` stable (+ valeurs utiles) que le composant traduit : `UserList` (`self`, `last_admin`, `not_found`), `SignInForm` (`account_disabled`, `rate_limited`), `BrandingForm` (`too_large`, `unsupported_format`)
- Authentification OTP : le code est renvoyé au client pour affichage immédiat (choix assumé : démo + comptes simples, pas d'envoi d'email, aucune mitigation supplémentaire pour l'admin)
- Secrets en base chiffrés AES-256-GCM (`crypto.ts`) : clé API du moteur IA, jamais renvoyée au navigateur, ni exportée, ni journalisée
- Uploads d'images (logo, fond, import) : **magic bytes** + taille ; **SVG refusé** (c'est du code) ; servis avec `Content-Security-Policy: sandbox` et `nosniff`
- En-têtes (`next.config.mjs`, CSP seulement en production) : CSP avec `unsafe-inline` (choix assumé) mais `frame-ancestors 'none'`, `object-src 'none'`, X-Frame-Options, Referrer-Policy, Permissions-Policy. **HSTS non posé** (à ajouter côté Caddy en mode HTTPS seulement)
- Conteneur `app` : `no-new-privileges`, `cap_drop: [ALL]` (pas postgres/caddy/ollama : entrypoints qui changent d'utilisateur, ports bas, GPU)
- Journal d'audit fire-and-forget (`audit.ts`, une erreur est journalisée dans la console) ; les purges manuelles et automatiques s'y inscrivent **après** la suppression

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

`-y/--yes` (jamais de question), `--answers FILE` (lignes `LEKSIS_<KEY>=valeur`, jamais `source`), `--dir DIR`, `--no-tui`, `-V`, `-h`. Clés : `INSTALL_DIR REPO_URL APP_HOST ADMIN_EMAIL ADMIN_NAME AI_MODE AI_URL GPU_VENDOR SAME_MODEL_FOR_ALL AI_MODEL AI_OCR_MODEL AI_REWRITE_MODEL OLLAMA_MAX_LOADED_MODELS POSTGRES_PASSWORD PULL_REMOTE_MODELS UPDATE_COMPONENTS CONFIRM_DELETE CONFIRM_RESTORE …`. Les opérations destructives exigent leur confirmation typée même en `--yes` (`LEKSIS_CONFIRM_DELETE=DELETE`, `LEKSIS_CONFIRM_RESTORE=RESTORE`).

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

- **3 modes de moteur IA** (variable interne `AI_MODE`) : `local` (conteneur Ollama), `remote` (serveur Ollama) et **`openai`** (API compatible OpenAI). `.env` : `AI_PROVIDER` (`ollama`|`openai`), `AI_BASE_URL`, `AI_API_KEY` (en clair dans le `.env` chmod 600, masquée dans l'aperçu ; la clé enregistrée par l'admin — chiffrée en base — a priorité), `AI_MODEL` / `AI_OCR_MODEL` / `AI_REWRITE_MODEL` ; `COMPOSE_PROFILES=ollama` **uniquement** en `local`. Clés de réponse : `AI_MODE` (`local|remote|openai`), `AI_URL`, `AI_API_KEY` et `AI_MODEL` / `AI_OCR_MODEL` / `AI_REWRITE_MODEL` (les anciennes clés `OLLAMA_MODE` / `OLLAMA_URL` / `OLLAMA_MODEL` / `OLLAMA_OCR_MODEL` / `OLLAMA_REWRITE_MODEL` restent acceptées via `map_answer_aliases`)
- Mode `openai` : `configure_openai_api` (URL normalisée en `.../v1`, clé via `p_secret`, test `GET /models` avec `openai_models`, avertissement `host_looks_private` si le serveur semble externe — l'app le bloquera tant que « Autoriser les serveurs hors du réseau privé » n'est pas coché dans l'admin) ; les modèles sont les **ids servis** (`ask_openai_model` propose la liste renvoyée par l'API) ; **aucun pull** (`ensure_models` vérifie seulement) ; pas de GPU / drivers / runtime
- `sync_ai_config_db [yes]` remplace `sync_ollama_config_db` : met à jour `site_settings.ai_config` (ou l'ajoute à partir de l'ancienne `ollama_config`) ; `yes` efface aussi la clé chiffrée stockée quand le mode / l'URL / la clé changent, pour que la clé du `.env` s'applique
- `migrate_env` ajoute `AI_PROVIDER=ollama`, `AI_BASE_URL`, `AI_API_KEY=` aux `.env` d'avant la 1.2, et réécrit `AI_PROVIDER=vllm` → `openai` (identifiant des `1.5.0-beta.1/2`, dont le provider vLLM + routage TranslateGemma a été retiré) ; `getAiConfig()` normalise aussi `vllm` → `openai` (base et env)

- **Ollama est un profil compose** (`profiles: ["ollama"]` dans `docker-compose.yml`). `COMPOSE_PROFILES=ollama` dans `.env` = conteneur local ; vide = serveur distant. **Source de vérité du mode : `ollama_local_enabled`** (lit `COMPOSE_PROFILES`). Ne jamais réintroduire un `depends_on: ollama` sans `required: false` (Compose ≥ 2.20, vérifié par `install_docker` via `MIN_COMPOSE_VERSION`) ni coder l'URL du moteur en dur dans le compose (`${AI_BASE_URL:-${OLLAMA_BASE_URL:-http://ollama:11434}}` : le repli sur l'ancien nom est nécessaire pendant `update`, où l'ancien `install.sh` tourne encore avec le nouveau compose)
- `app` a `extra_hosts: host.docker.internal:host-gateway` : une URL `localhost`/`127.x` saisie pour un Ollama distant est réécrite en `host.docker.internal` (`AI_URL` = vue des conteneurs, `AI_URL_HOSTSIDE` = vue de l'hôte pour les tests curl)
- En mode distant : pas de détection GPU, pas de drivers, pas d'overlay compose, pas de questions de runtime, pas de `wait_healthy ollama`. Les modèles manquants peuvent être tirés via `POST /api/pull` (`stream:false`) après confirmation
- ⚠️ **`site_settings.ollama_config` (admin → Services → AI) prend le pas sur `.env`** dès qu'il a été sauvegardé (`getOllamaConfig`). `sync_ollama_config_db` met à jour ce JSONB (`baseUrl`, modèles) pour que `install.sh config` ait un effet réel
- `migrate_env` (appelé par `require_install`) : un `.env` d'avant cette version sans `COMPOSE_PROFILES` reçoit `ollama` (si `OLLAMA_BASE_URL` est vide ou interne) — sans ça, `update` ne redémarrerait plus le conteneur Ollama. Il garde aussi la garde `POSTGRES_VERSION=16`, et (1.5.1) renomme `OLLAMA_MODEL` / `OLLAMA_OCR_MODEL` / `OLLAMA_REWRITE_MODEL` en `AI_*` et supprime `OLLAMA_BASE_URL` (`_env_unset`)

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

## 🧪 Développement, qualité et tests

```bash
npm run dev        # → http://localhost:3000  (ne pas le lancer depuis Claude Code : il ajoute un bloc à CLAUDE.md)
npm run build      # build de production (à faire avant le e2e)
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint (eslint.config.mjs) — doit rester à 0 erreur, 0 avertissement
npm test           # Vitest : tests/unit/**/*.test.ts
npm run test:e2e   # tests/e2e/journeys.mjs : navigateur réel, base PGlite en mémoire, faux serveur Ollama
```

- **Avant chaque commit** : `typecheck`, `lint`, `test`, `build`. La CI (`.github/workflows/ci.yml`, push sur `main`/`dev` + PR, Node 22, `ubuntu-24.04`) enchaîne typecheck, lint, tests, `npm audit --omit=dev --audit-level=high`, build et e2e
- **Tests unitaires** : les modules qui touchent la base sont testés avec un vrai PostgreSQL en mémoire (**PGlite** chargé avec `docker/init-schema.sql`, `@/lib/db` remplacé par un adaptateur — voir `tests/unit/users.test.ts`). `server-only` est remplacé par un stub (`vitest.config.mts`). Piège : `beforeEach(() => mock.mockReset())` renvoie le mock, que Vitest prend pour une fonction de nettoyage → toujours des accolades
- **Test e2e** : serveur Next `standalone` sur `0.0.0.0` **sans** `NEXTAUTH_URL` (comme Docker — c'est ce qui a causé deux régressions de connexion/déconnexion). Couvre connexion → espace de travail → déconnexion, désactivation d'un utilisateur par un admin, traduction de documents face à un modèle qui fusionne les `|||`, nettoyage des journaux, réinitialisation des réglages, refus d'un logo SVG. Chaque nouvelle fonctionnalité qui touche l'authentification, les pages admin ou la chaîne IA doit y ajouter un scénario
- **Navigateur** : `CHROME_PATH`, sinon Chrome / Chromium / Edge sont cherchés aux emplacements usuels. Sous Windows, Edge ne se lance **pas** depuis le shell Bash de Claude Code (bac à sable) : lancer le e2e depuis PowerShell
- **Antislash perdus** : les expressions régulières et `\n` écrits par un script shell (heredoc, `node -e`) perdent leurs antislash sans erreur (`/^\d+$/` devenait `/^d+$/`, ce qui a désactivé le bouton Enregistrer d'Ollama de la beta.1 à la beta.6). Écrire ces lignes avec l'outil Edit/Write, puis relire — et tester la fonction (`isValidNumCtx` a maintenant son test)
- **Vérifier pour de vrai** : un test qui n'a jamais échoué ne prouve rien — casser volontairement le code pour voir le test échouer, puis restaurer
- Flux local : le frontend appelle `/api/*` ; le serveur appelle le moteur IA (`${AI_BASE_URL}/api/generate` ou `/v1/chat/completions`)

---

## 🧠 Instructions spécifiques à Claude Code

Priorité : robustesse, lisibilité, maintenabilité. **Messages de commit git en anglais.**

### Règles générales

- Respecter strictement les **4 fonctionnalités définies** ; ne jamais appeler le moteur IA depuis le client
- Conserver la structure exacte des panneaux (`gap-px bg-surface-container rounded-xl`) ; la liste des langues reste **triée alphabétiquement** (base + régionales mélangées)
- Tous les strings UI passent par `useI18n()` → `t.*`, jamais de libellé en dur. Tout nouveau namespace ou clé va dans les **4 fichiers** (`en.ts`, `de.ts`, `fr.ts`, `it.ts`) en même temps
- Les valeurs envoyées à l'API (id de ton, longueurs, features) restent des slugs stables — seul l'affichage est traduit
- Le titre de la page de connexion vient de `branding.siteName`, chargé côté serveur dans `signin/page.tsx`
- **Aucun CDN tiers** : Material Symbols et Bootstrap Icons sont self-hébergés (ne pas réintroduire de `<link>` vers `fonts.googleapis.com` ou `cdn.jsdelivr.net` ; pour mettre à jour Material Symbols, re-télécharger le woff2 depuis `fonts.gstatic.com`)

### Réglages (`site_settings`)

- Lecture : `getSetting(key)` (cache de 5 s, copie indépendante) ; `getAllSettings()` interroge toujours la base (pages admin). Écriture : `updateSetting()` **uniquement** (invalide le cache, journalise ; `auditValue` pour expurger un secret). Le TTL couvre les écritures hors application (`install.sh` écrit `ai_config`, `caddy_config`, `system_status` par `psql`)
- `getAllSettings()` retourne `Record<string, unknown>` : caster en `Record<string, Record<string, unknown>>` pour les propriétés imbriquées
- **`src/lib/settings-schema.ts`** : schémas zod de chaque clé éditable (`branding`, `design`, `general`, `features`, `rewrite_tones`), utilisés par le PATCH **et** l'import ; `SETTING_DEFAULTS` (réinitialisation, formulaires, limites tirées de `validators.ts`). Toute nouvelle clé de réglage s'y déclare (schéma + défaut) ; un test vérifie que chaque défaut passe son schéma. Les clés inconnues sont retirées à l'enregistrement
- Clés hors de ce mécanisme : `ai_config` (Services → AI), `caddy_config` (Services → Caddy), `system_status` (écrite par `install.sh` seulement)
- Tons de réécriture : clé `rewrite_tones` (tableau JSONB, 1 à 6 tons) ; `lib/tones.ts` fournit les défauts et migre l'ancien format (`label: string` → `labels: { en }`). `ToneConfig.labels` : `en` requis, `fr`/`de`/`it` en repli sur `en`
- Tonalité par défaut : `features.defaults.formality` (`Informal` par défaut), pré-remplit `TextTranslationTab`
- **Conservation des journaux** : `general.usageRetentionDays` (365) et `auditRetentionDays` (730), 0 = garder. `lib/retention.ts` supprime par lots de 10 000, lancé par `instrumentation.ts` 2 min après le démarrage puis toutes les 6 h (`LEKSIS_RETENTION_DELAY_SEC` pour les tests), et s'inscrit à l'audit (`AUTO_PURGE_*`, utilisateur `system`)
- `headerLogoSize` est dans `branding` (repli de lecture sur `design`) ; le fond du site est une couleur **ou** une image (`BrandingForm` supprime l'image en passant en mode Couleur)

### Comptes et sessions

- Les comptes se créent à la première connexion (OTP). **Supprimer un compte n'empêche donc pas la personne de revenir** : le vrai blocage est la désactivation (`users.disabled`), dite comme telle dans l'interface
- Le rôle est figé dans le JWT (30 jours) mais **relu en base** à chaque lecture de session (`lib/users.ts`, cache 30 s, invalidé au changement) : un compte supprimé ou désactivé perd sa session, une rétrogradation est immédiate. Base injoignable = on garde le rôle du jeton
- Modifier un compte passe **uniquement** par `changeUser()` / `removeUser()` : transaction avec verrou consultatif, refus de se rétrograder / désactiver / supprimer soi-même, et il reste toujours au moins un administrateur actif (`self`, `last_admin`, `not_found`)
- Connexion : `authorize()` et `/api/auth/otp` refusent un compte désactivé (`account_disabled`)
- `signOutToSignIn()` (`lib/sign-out.ts`) se déconnecte puis navigue **lui-même** vers `/auth/signin` : ne pas redéclarer de callback Auth.js `redirect` (il casse `signIn()`, « Invalid URL »)

### Base de données et migrations

- Installations neuves : `docker/init-schema.sql` (exécuté au premier démarrage du volume seulement). Installations existantes : `docker/migrations/NNN-nom.sql`, **idempotentes et non destructives**, appliquées par `leksis update` / `leksis migrate` (suivi dans la table `schema_migrations`, backup automatique avant). Toute évolution de schéma = les deux
- Le code qui dépend d'une nouvelle colonne échoue brièvement entre le redémarrage de l'app et l'application de la migration pendant `update` : le signaler dans les notes de version
- Pas d'adaptateur NextAuth : les tables `accounts`, `sessions`, `verification_token` n'existent plus (supprimées par la migration 001, avec `db_config`, `seo` et l'ancien `ollama_config`)

### Documents

- Traduction par **lots de 3000 caractères** (`lib/doc-translate.ts`) : le nombre de segments renvoyé est vérifié, redemandé une fois, puis le lot est coupé en deux jusqu'à un segment isolé — jamais de décalage silencieux. Le prompt annonce le nombre de segments ; les segments vides ne partent pas au modèle ; un avertissement serveur est journalisé quand le modèle ne respecte pas les `|||`
- Extraction : `blocksToSegments` / `applySegments` (`file-parser.ts`). Formats : PDF, DOCX, TXT, CSV (pas `.doc`). PDF scanné : OCR par le modèle vision, 20 pages max. Fichiers ≤ 10 Mo, limite de caractères réglable dans l'admin

### Glossaire

- **En base** (`glossaries`, `glossary_entries`, `user_glossary_prefs`), jamais en localStorage. `lib/glossary.ts` (server-only) : `fetchGlossaryEntries()` respecte les préférences de l'utilisateur ; l'injection dans les prompts est **exclusivement côté serveur** (`/api/translate`, `/api/rewrite`) — le client n'envoie jamais de `glossaryClause`
- Chaque entrée a `source_lang` / `target_lang` (BCP47 ou NULL = toutes). Réécriture (même langue) : seules les entrées NULL+NULL. `user_glossary_prefs` : une ligne n'existe que si `enabled = FALSE`
- Import CSV `source,target,source_lang,target_lang` (colonnes langue optionnelles, dans une transaction) ; export CSV **100 % client** (`exportEntriesToCSV`)
- `/api/admin/usage` : paramètre `limit` 1–500 (défaut 100), agrégation en SQL ; `UsagePanel` expose 25/50/100/200/500

### Docker, Ollama, Caddy

- **Versions** : `postgres` = `${POSTGRES_VERSION:-18}-alpine` (jamais `postgres:NN-alpine` en dur ; changer de version majeure demande `pg_upgrade` ou dump/restore) ; `node:22-slim` épinglé (Debian requis pour `@napi-rs/canvas`) ; `caddy:2-alpine` ; `ollama/ollama:latest` sans port hôte. Le service `postgres` fixe `PGDATA=/var/lib/postgresql/data` : **ne jamais** le pointer vers un sous-répertoire (un `initdb` silencieux effacerait les données)
- **Ollama** : conteneur optionnel (profil compose `ollama`), port `11434` non exposé. Le chargement en VRAM se fait depuis l'admin (« Load into VRAM », `keep_alive: -1`, modèles dédupliqués) ; les requêtes ordinaires ne passent pas `keep_alive` mais **`num_ctx`** (réglage Services → AI → Models, défaut 8192). Téléchargement : `OllamaModelSelect` (« Télécharger et utiliser », `POST …/ollama/pull`, progression en flux) ; suppression : onglet Monitoring (corbeille désactivée pour les modèles configurés)
- **Accès / Caddy** : un seul concept, le **mode d'accès** — `http` (`:80` sur l'IP), `https` (domaine → Let's Encrypt, option `keepHttpFallback`) ou `proxy` (`:80` derrière NPM/Traefik). `site_settings.caddy_config = { mode, host, keepHttpFallback, trustedProxies, behindProxy }`. `lib/caddy-config.ts` (client-safe) : `resolveCaddyConfig()` (rétrocompatible avec l'ancien `{ host, behindProxy }` ; sans rien en base l'état vient de `CADDY_HOST`), `normalizeCaddyConfig()` (une IP est refusée comme domaine), `generateCaddyfile()`. ⚠️ **`caddyfile_content()` d'`install.sh` génère le même Caddyfile : toute modification de `generateCaddyfile()` doit être répliquée** (et inversement ; aussi `docker/caddy/Caddyfile`)
- **Proxys de confiance** : le Caddyfile déclare `servers { trusted_proxies static private_ranges [+ trustedProxies] }` dans tous les modes, Caddy transmet alors les `X-Forwarded-*` à l'app (pas de `header_up X-Forwarded-*` : un placeholder vide écrasait l'en-tête)
- **Adresse publique détectée, pas de `NEXTAUTH_URL`** : `trustHost: true`, et Auth.js réécrit l'origine de chaque requête avec `NEXTAUTH_URL`/`AUTH_URL` s'ils sont définis — le compose passe `NEXTAUTH_URL: ${NEXTAUTH_URL:-}` (vide). `migrate_pinned_url` (`cmd_update`) vide l'ancienne valeur `http(s)://<IPv4>` ; `PinnedUrlNotice` avertit tant que la variable existe. ⚠️ Le serveur standalone tourne avec `HOSTNAME=0.0.0.0` : sans `NEXTAUTH_URL`, le proxy construit `callbackUrl` avec l'adresse INTERNE (`http://0.0.0.0:3000/…`). `SignInForm` n'utilise donc que le **chemin** de `callbackUrl` (`safeCallbackPath`, aussi contre une redirection vers un autre site) — ne jamais rediriger vers un `callbackUrl` absolu
- **Changer d'accès** : Admin → Services → Caddy ou `leksis config`. `PATCH /api/admin/services` (`service: 'caddy'`) enregistre puis recharge Caddy à chaud (`POST http://caddy:2019/load`) ; échec → `{ ok: true, reloadError }`. `caddy/metrics` ajoute `mode`, `domain`, `tls` (`checkCertificate()`) ; `CaddyMetrics` re-vérifie toutes les 5 s (3 min) après un enregistrement (événement `leksis:caddy-saved`). `install.sh` : `ask_access` puis `apply_access_config` (écrit `caddy_config` **et** recharge Caddy — `CADDY_HOST` seul ne suffit pas : Caddy démarre avec `--resume` et l'`autosave.json` du volume prime)
- Divers Caddy : `GET /` est 404 en Caddy v2 (utiliser `GET /config/`) ; la version se lit dans l'en-tête `Server` de `HEAD http://caddy:80/` (`Caddy/?([\d.]+)`) ; `GET /api/admin/services` retourne `{ ai, db, caddy }`

### Admin

- **Dashboard** : `/admin/dashboard` (server component, requêtes directes via `query()` : utilisateurs, appels du jour, termes de glossaire, 5 dernières entrées d'audit, tendance 7 jours, répartition par feature, `system_status.lastBackupAt`). La santé Ollama/DB/Caddy est lue côté client sur les 3 routes `metrics`. `AdminSidebar` : `useServiceStatus()` pour les pastilles (vert / rouge / gris en chargement)
- **`site_settings.system_status`** : écrite uniquement par `install.sh` (`record_backup_timestamp`) ; lue par la carte Backup du dashboard et par `ExportImportForm` (rouge au-delà de 8 jours ou sans sauvegarde)
- **Deux sauvegardes distinctes, volontairement non fusionnées** : `leksis backup` (`pg_dump` + `uploads.tar` + `.env`, seule compatible avec `leksis restore`) et l'export JSON d'Admin → Backup (`site_settings` sans secret + glossaires + logo/fond en base64, jamais `users`/`audit_log`/`usage_log`). Ne pas les faire converger : mettre le `.env` (mot de passe PostgreSQL, `AUTH_SECRET`, `ENCRYPTION_KEY`) dans un fichier téléchargeable élargirait la surface d'attaque
- Import de configuration : clés validées par les schémas, invalides ignorées et listées (`skipped`) ; `ai_config` importé sans clé API ni `allowExternal` (ceux de l'instance sont conservés) ; `ollama_config` non importable

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
