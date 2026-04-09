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
- Tons disponibles : Professional, Casual, Friendly, Authoritative, Empathetic, Creative
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
├── app/
│   ├── api/
│   │   ├── translate/route.ts           (Traduction texte — streaming)
│   │   ├── translate/document/route.ts  (Traduction documents — JSON blocks)
│   │   ├── rewrite/route.ts             (Réécriture IA — streaming)
│   │   └── ocr/route.ts                 (OCR image via Ollama vision — streaming)
│   ├── admin/
│   │   ├── layout.tsx                   (requireAdmin + AdminClientLayout + AdminSidebar)
│   │   ├── settings/page.tsx            (AdminPageHeader + SettingsTabs)
│   │   ├── services/page.tsx            (AdminPageHeader + ServicesPanel)
│   │   ├── users/page.tsx               (AdminPageHeader + UserList)
│   │   ├── usage/page.tsx               (AdminPageHeader + UsagePanel)
│   │   └── audit/page.tsx               (AdminPageHeader + AuditTable)
│   ├── settings/
│   │   └── page.tsx                     (I18nProvider + profil + session)
│   ├── globals.css                      (Tailwind v4 @theme + classes CSS custom)
│   ├── layout.tsx                       (Fonts, Material Symbols, Bootstrap Icons CDN)
│   └── page.tsx                         (Workspace — tabs centrés)
│
├── components/
│   ├── tabs/
│   │   ├── TextTranslationTab.tsx       (Debounce 400ms detect + 800ms translate, swap, formality)
│   │   ├── DocumentStudioTab.tsx        (Upload → extract → translate → blocks HTML)
│   │   ├── ImageExtractionTab.tsx       (OCR + traduction optionnelle, stats)
│   │   └── AIRewriteTab.tsx             (Modes rewrite/correct, 6 tons, length)
│   ├── ui/
│   │   ├── HomeClient.tsx               (I18nProvider wrapper + HomeWorkspace interne)
│   │   ├── AccountMenu.tsx              (Menu utilisateur — positionné par HomeClient)
│   │   ├── UILanguageSwitcher.tsx       (Switcher EN/DE/FR avec drapeaux SVG inline)
│   │   ├── LanguageDropdown.tsx         (Liste alphabétique unifiée, favoris, portal fixe)
│   │   └── GlossaryPanel.tsx            (Slide-in, add/remove/import/export CSV)
│   └── admin/
│       ├── AdminClientLayout.tsx        (Fournit I18nProvider aux composants admin)
│       ├── AdminPageHeader.tsx          (Titre + description de page traduits, prop section=)
│       ├── AdminSidebar.tsx             (Navigation admin traduite)
│       ├── SettingsTabs.tsx             (Onglets Identité/Interface/Fonctionnalités/Accès)
│       ├── BrandingForm.tsx             (Logo, couleurs, fond, mode sombre)
│       ├── DesignForm.tsx               (Radius boutons, taille logo, footer)
│       ├── FeaturesForm.tsx             (Modules actifs, langues défaut, limites API)
│       ├── GeneralForm.tsx              (Email contact, bannière, mode maintenance)
│       ├── ServicesPanel.tsx            (Conteneur Ollama + PostgreSQL)
│       ├── OllamaServiceForm.tsx        (Config Ollama, test connexion)
│       ├── DbServiceForm.tsx            (Config PostgreSQL, test connexion)
│       ├── UserList.tsx                 (Tableau utilisateurs, toggle rôle admin)
│       ├── UsagePanel.tsx               (Stats IA filtrées par date, export CSV)
│       ├── AuditTable.tsx               (Journal d'audit paginé)
│       └── PurgeButton.tsx              (Purge avec confirmation et date)
│
├── locales/
│   ├── en.ts                            (Source canonique — définit le type Messages)
│   ├── de.ts                            (Traduction allemande — satisfies Messages)
│   └── fr.ts                            (Traduction française — satisfies Messages)
│
├── lib/
│   ├── i18n.tsx                         (I18nProvider, useI18n, UILocale — zero-dep)
│   ├── ollama.ts                        (SERVER-ONLY: streamOllamaResponse, callOllama)
│   ├── prompts.ts                       (Factory prompts: translate, document, ocr, rewrite, correct)
│   ├── file-parser.ts                   (SERVER-ONLY: parsePdf, parseDocx, parseTxt, Block model)
│   ├── validators.ts                    (Limites: text=5000, doc=12000, image=10MB)
│   ├── languages.ts                     (LANGUAGES[] triés BCP47 + detectLanguage())
│   └── glossary.ts                      (buildTranslationGlossaryClause, buildRewriteGlossaryClause, CSV)
│
└── types/
    └── leksis.ts                        (Language, Block, Formality, RewriteTone, RewriteLength, etc.)
```

---

## 🌍 Internationalisation (i18n)

L'interface est entièrement traduite en **Anglais (EN), Allemand (DE) et Français (FR)**.

### Architecture

- **Zéro dépendance** : contexte React custom (`src/lib/i18n.tsx`) en ~50 lignes
- Préférence persistée dans `localStorage` (clé : `leksisUILocale`)
- Strings imbriquées à 2 niveaux : `composant.clé` (ex: `t.textTab.translate`)
- `en.ts` est la **source de type** via `DeepString<typeof messages>` → `Messages`
- `de.ts` et `fr.ts` utilisent `satisfies Messages` pour garantir la couverture complète à la compilation
- Interpolation dynamique via `{0}`, `{1}` et `.replace()` inline (ex: `t.userList.toastRoleUpdated.replace('{0}', email)`)

### Sélecteur de langue

- `UILanguageSwitcher` dans le header, à gauche de `AccountMenu`
- Affiche le **drapeau SVG inline** de la locale active (pas de texte)
- Dropdown avec drapeau + code court (EN/DE/FR) + checkmark sur la locale active
- Drapeaux : `FlagGB` (Union Jack avec saltire counterchangé via clipPath), `FlagDE`, `FlagFR`

### Pattern provider

Les composants appelant `useI18n()` doivent être enfants d'un `I18nProvider`.

| Contexte | Provider |
|----------|----------|
| Workspace principal | `HomeClient` wraps `I18nProvider` → `HomeWorkspace` |
| Section admin | `AdminClientLayout` (importé dans `admin/layout.tsx`) |
| Page settings | `SettingsPage` wraps `I18nProvider` → `SettingsContent` |

### Espaces de noms définis

`home`, `account`, `textTab`, `docTab`, `imgTab`, `rewriteTab`, `langDropdown`, `glossary`, `langSwitcher`, `settingsPage`, `adminSidebar`, `adminPages`, `settingsTabs`, `brandingForm`, `designForm`, `featuresForm`, `generalForm`, `ollamaForm`, `dbForm`, `userList`, `usagePanel`, `auditTable`, `purgeButton`

---

## 🎨 UI / Design

### Layout

- Header : barre de tabs centrée — à droite, un wrapper flex `absolute right-4` contient `UILanguageSwitcher` + `AccountMenu`
- Workspace : `max-w-[1440px]`, `px-6 md:px-8`, `pt-6`
- Footer 3 colonnes : Privacy / Precision / Editorial

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
| `buildRewritePrompt()` | Réécriture (tone + length + glossaire) |
| `buildCorrectPrompt()` | Correction grammaticale |
| `buildLangClause()` | Clause "respond in [lang] only" |

---

## 🔐 Sécurité & bonnes pratiques

- Séparation stricte client / serveur
- Aucun secret exposé côté client
- Aucune logique IA dans les composants React
- Validation des entrées dans `src/lib/validators.ts`
- Préparation aux contraintes entreprise (audit, RBAC, logs)

---

## ♻️ Réutilisation de `Leksis_old`

Le dossier **`Leksis_old/`** contient la première version fonctionnelle (vanilla JS).

### Ce que Claude Code DOIT faire

- S'inspirer de `Leksis_old` pour :
  - l'interface utilisateur (layout, UX, wording)
  - les parcours fonctionnels
  - les prompts et la logique IA

### Ce que Claude Code NE DOIT PAS faire

- Migrer aveuglément tout le code legacy
- Introduire des appels directs à Ollama depuis le client
- Dériver vers des fonctionnalités hors périmètre

`Leksis_old` est une **référence fonctionnelle et UX**, pas une base technique.

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
- Lire `Leksis_old` avant toute proposition d'UI ou de logique métier
- Conserver la structure exacte des panneaux (`gap-px bg-surface-container rounded-xl`)
- La liste des langues doit toujours être **triée alphabétiquement** (base + régionales mélangées)
- Tous les strings UI doivent passer par `useI18n()` → `t.*` — ne jamais hardcoder de libellés
- Tout nouveau namespace i18n doit être ajouté dans les 3 fichiers (`en.ts`, `de.ts`, `fr.ts`) simultanément
- Les valeurs envoyées à l'API (tons, longueurs, features) restent en anglais — seul l'affichage est traduit
- Priorité : robustesse, lisibilité, maintenabilité

---

Fin du document.
