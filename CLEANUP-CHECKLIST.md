# Leksis — Cleanup & security checklist

Source : revue de code du 2026-09-25. Une phase = un commit sur `dev` (messages en anglais).
Avant chaque commit : `npx tsc --noEmit` et `npm run build`.

## Décisions prises

- **OTP affiché à l'écran** : conservé (démo d'authentification + comptes simples). Aucune mitigation supplémentaire pour le compte admin.
- **`db_config` / onglet PostgreSQL Connection** : option A — supprimer l'onglet et le réglage, garder Monitoring.
- **`keep_alive`** : retiré des requêtes Ollama ; le conteneur local garde `OLLAMA_KEEP_ALIVE=-1` (compose).
- **Registre npm** : retirer `npmmirror` du Dockerfile.
- **Mode maintenance** : doit aussi bloquer les API pour les non-admins.
- **`.doc`** : format supprimé (seuls PDF, DOCX, TXT, CSV).

## Phase 0 : Dépendances

- [x] Mettre à jour `next` vers la dernière 16.x corrigée (S1)
- [x] Mettre à jour `next-auth`, `@auth/pg-adapter` et `@auth/core` (S1)
- [x] Mettre à jour `mammoth` pour `@xmldom` (S1)
- [x] Relancer `npm audit --omit=dev`, objectif zéro critique ; noter ce qui reste et pourquoi
- [x] Retirer `--registry https://registry.npmmirror.com` du Dockerfile
- [x] Déplacer `@types/pg` en devDependencies, supprimer `autoprefixer`
- [x] Déclarer `pdfjs-dist` explicitement dans `package.json`
- [x] `docx` 8 → 9 (retire un `nanoid` vulnérable). `overrides` ajoutés dans `package.json` pour `@xmldom/xmldom` (^0.8.15, mammoth le plafonne en 0.8.x) et `baseline-browser-mapping` : à retirer quand mammoth/next les embarqueront corrigés
- [x] Build + génération/lecture DOCX vérifiés en local (docx 9, mammoth) — **reste à tester sur la VM beta : login, traduction, PDF scanné**

## Phase 1 : Bugs confirmés

- [x] DOCX : ne plus perdre les listes à puces et les titres h3+ (`file-parser.ts`) ; test avec un DOCX à listes
- [x] Tons : ajouter `it` au `ToneConfigSchema` (`settings/route.ts`)
- [x] Reset : retirer `?v=…` avant `unlink`, ajouter `basename`, inclure `features` dans les défauts
- [x] Ollama : supprimer `keep_alive: -1` des requêtes (`ollama-provider.ts`)
- [x] Ollama : gérer les lignes `{"error":…}` dans le flux NDJSON
- [x] Ollama : définir `num_ctx` — réglage admin (Services → AI → Models), défaut 8192, aussi appliqué au « Load into VRAM »
- [x] `extract/document` : garde de fonctionnalité + `getDynamicLimits()` au lieu de la constante
- [x] Supprimer `.doc` : `validators.ts`, `parseFile`, `accept=` dans `DocumentStudioTab`, README
- [x] `<html lang>` selon la locale d'interface (au lieu de `fr` en dur)
- [x] Écran de maintenance en i18n (nouveau `MaintenanceScreen`, namespace `maintenance` dans les 4 locales) ; `app/maintenance/page.tsx` supprimée (route orpheline jamais utilisée)
- [x] Page Usage : agrégation en SQL, validation `from`/`to` (400), `parseInt` sur `page` dans l'audit
- [x] Import de glossaires dans une transaction

## Phase 2 : Sécurité des routes

- [x] Garde commun `requireUser()` (401 JSON) dans les 6 routes IA/export (S2) — `src/lib/user-guard.ts`
- [x] Y intégrer le mode maintenance : 503 pour les non-admins — 503 `maintenance` pour les non-admins
- [x] Rate-limit par utilisateur sur translate, rewrite, ocr, translate/document, extract/document (seuils à choisir avec l'utilisateur) — 30/min par défaut, réglable dans Admin → Réglages → Features & limits (0 = illimité)
- [x] Rate-limit sur `/api/auth/otp` — 20/min par IP, 5/min par email
- [x] Plafond de taille : fichiers, JSON export docx, import de config ; Caddy `request_body max_size` (Caddyfile + `caddy-config.ts` + `install.sh` identiques) — documents 10 Mo, images = limite admin, export docx 5 Mo, import config 15 Mo (413 avant lecture du corps) ; Caddy `max_size 50MB` dans les 3 générateurs (vérifiés identiques)
- [x] Plafond de pages pour l'OCR de PDF scanné + `pdf.destroy()` — 20 pages (`OCR_MAX_PDF_PAGES`) + `pdf.destroy()`
- [x] Export docx : nettoyer `filename` (RFC 5987), valider la taille des `blocks` — corps validé par zod, 20 000 blocs max, `Content-Disposition` RFC 5987
- [x] Valider `sourceLang`/`targetLang` avant les prompts — noms, codes, formality, length ; les 41 langues de l'UI passent
- [x] Export CSV usage : neutraliser les formules, guillemets sur les champs
- [x] Ne plus renvoyer `err.message` au client (logo, background, users/[id], extraction)
- [x] Supprimer les `console.log` de debug de logo et background

## Phase 3 : Sessions, audit, OTP

- [x] Relire le rôle en base (cache court) pour que la rétrogradation soit immédiate — `lib/users.ts` : cache 30 s, invalidé au changement de rôle ; compte supprimé = session invalidée ; base injoignable = on garde le rôle du jeton
- [x] OTP : `crypto.randomInt`, vérification atomique, format d'email, purge des `otp_tokens` expirés — + `ON CONFLICT` sur la création de compte, limite de 10 essais/min par email à la vérification ; testé sur un vrai Postgres (PGlite) : 3 vérifications simultanées → 1 seule réussit
- [x] Journaliser les purges audit/usage sans effacer leur propre trace — `PURGE_AUDIT` / `PURGE_USAGE`, écrits après la suppression
- [x] `logAudit` : au minimum un `console.error` en cas d'échec

## Phase 4 : Réglages, images, en-têtes

- [x] Schémas zod pour `branding`, `design`, `general`, `features` (couleurs hex, URLs http(s), nombres bornés) — `src/lib/settings-schema.ts` (couleurs hex, images = uniquement `/api/site-assets/…`, liens http(s)/mailto/relatifs, limites bornées) ; clés inconnues retirées (ex. l'ancien `darkMode`)
- [x] Mêmes schémas dans l'import de config — les clés invalides sont ignorées et listées dans `skipped` ; `ai_config` importé validé aussi ; `ollama_config` n'est plus importable
- [x] Import d'images : plafond de taille + magic bytes
- [x] `site-assets` : `Content-Security-Policy: sandbox` + `nosniff`
- [x] Logo/background : magic bytes, refus ou nettoyage du SVG — SVG refusé (PNG/JPG/WebP ; ICO en plus pour le logo). Un logo SVG déjà enregistré reste affiché (servi en sandbox) jusqu'au prochain upload. Helper commun `src/lib/site-assets.ts`
- [x] En-têtes de sécurité dans `next.config.mjs` (CSP, X-Frame-Options, Referrer-Policy, `poweredByHeader: false`) — CSP avec `unsafe-inline` (décision utilisateur) mais `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`, `form-action`, `connect-src`/`img-src`/`font-src` limités à l'origine ; X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP ; CSP seulement en production. HSTS volontairement non posé (voir notes)
- [x] Docker : `no-new-privileges`, `cap_drop: [ALL]` sur `app`, épingler les versions ollama/caddy — appliqué à `app` seulement ; postgres/caddy/ollama exclus (entrypoints qui changent d'utilisateur / ports bas / GPU). Pas d'épinglage : `caddy:2-alpine` suit déjà la v2, `ollama:latest` doit rester à jour pour les nouveaux modèles
- [x] PostgreSQL (option A) : supprimer l'onglet Connection, `DbServiceForm`, `db/test`, et `db_config` (PATCH, export, import, page) — page DB = Monitoring seul ; `DbServiceForm`, `DbServicesLayout`, `db/test` et `db_config` supprimés (PATCH, GET, export, import)

## Phase 4 bis : Décisions ajoutées en cours de route

- [x] **Mode sombre supprimé** (demande de l'utilisateur) : bascule du menu compte, réglage admin, CSS `.dark`, script anti-flash, clés i18n
- [x] `GET /api/admin/settings` ne renvoie plus `apiKeyEnc` (clé API chiffrée) au navigateur
- [x] Les 9 warnings de build « Dynamic filesystem access » sont résolus (helper `site-assets.ts` + `turbopackIgnore`)
- [x] Erreur React #418 à l'ouverture de la page de connexion (signalée en test beta.2, présente depuis v1.5.0) : `Suspense` retiré de la page de connexion — corrigé sur `dev`, sera dans la beta.3
- [ ] HSTS : à ajouter côté Caddy en mode HTTPS seulement (après validation que le retour en HTTP n'est plus prévu) — non fait volontairement

## Phase 4 ter : Déconnexion renvoyée sur 0.0.0.0

- [x] Cause : le serveur Next écoute sur `HOSTNAME=0.0.0.0` (Docker) et Auth.js en déduit l'adresse du site, même derrière Caddy/proxy → `signOut()` renvoyait `http://0.0.0.0:3000`. Reproduit avec un vrai login/logout.
- [x] Correctif : `signOutToSignIn()` (`lib/sign-out.ts`) se déconnecte puis navigue vers `/auth/signin` lui-même. ⚠️ Une première version ajoutait un callback Auth.js `redirect` renvoyant des chemins relatifs : il cassait la validation du code (`signIn()` fait `new URL(data.url)`, « Invalid URL ») — retiré dans la beta.4. Parcours connexion/déconnexion désormais vérifié dans un vrai navigateur (Edge headless + puppeteer-core)

## Phase 5 : Code mort et doublons

- [x] Supprimer `AdminToastWrapper.tsx`, `NO_CAPABILITIES`, `validateDocumentInput` (déjà fait en Phase 2), `RewriteTone` — + `NO_CAPABILITIES`, `RewriteTone`
- [x] Supprimer le type `html` de `Block` et ses branches (file-parser ×3, DocumentStudioTab ×2)
- [x] Supprimer le réglage `seo` (PATCH, reset, export) — les anciennes lignes `seo` restent en base sur les installations existantes : à supprimer dans la migration de la Phase 6
- [x] Factoriser les helpers de parsing de tables HTML (`file-parser` / `pdf-vision`) — `stripInlineHtml` + `parseHtmlTable` partagés (entité `&nbsp;` décodée en plus)
- [x] Fusionner les routes logo et background dans un helper commun — fait en Phase 4 (`site-assets.ts`)
- [x] Simplifier `fetchGlossaryEntries` (une requête paramétrée, retirer le `JOIN glossaries` inutile) — une seule requête ; vérifié sur Postgres (6 scénarios)
- [x] `getAiPublicConfig` : une seule lecture de base
- [x] Corriger les commentaires périmés (`prompts.ts`, `settings.ts`, `file-parser.ts` + `import 'server-only'`)
- [x] `pool.on('error')`, `max`, `statement_timeout` dans `db.ts` — max 10, timeout de connexion 5 s, `statement_timeout` 30 s
- [x] Supprimer le dossier vide `Prompt/`
- [x] Uniformiser la langue des messages d'API (EN) — anglais partout côté serveur. Fait en phase 7 : `UserList`, `SignInForm` et `BrandingForm` reçoivent des codes d'erreur (+ valeurs) et affichent un texte traduit

## Phase 6 : Base de données (migration requise)

- [x] Vérifier que `PostgresAdapter` ne sert à rien (tester le login sans lui) — parcours connexion → espace de travail → déconnexion vérifié dans un vrai navigateur sans l'adaptateur, sur l'ancien schéma (tables présentes) et sur le nouveau
- [x] Si oui : le retirer, puis supprimer `accounts`, `sessions`, `verification_token`, colonnes `emailVerified`/`image` — adaptateur, export `pool` de `db.ts` et dépendance `@auth/pg-adapter` retirés ; `init-schema.sql` sans ces tables/colonnes (installations neuves)
- [x] Écrire la migration dans `install.sh` (`update`) — y inclure `DELETE FROM site_settings WHERE key IN ('db_config', 'ollama_config' si ai_config existe)` : `db_config` contient encore un mot de passe chiffré inutilisé — `docker/migrations/001-remove-unused-auth-and-settings.sql` appliqué par `migrate_db` à la fin de `leksis update`. Idempotent et non destructif : une table ou colonne qui contient des données est conservée. Supprime aussi `db_config`, `seo` et `ollama_config` (si `ai_config` existe). Testé sur Postgres : ancien schéma, données présentes, config héritée seule, installation neuve, double exécution

- [x] **Lanceur de migrations corrigé après le test de la beta.5** : pendant `leksis update`, le shell exécute encore l'ancienne version de `install.sh` (chargée en mémoire avant le `git checkout`) → la migration de la release qu'on vient d'installer ne tournait pas (constaté : aucune ligne « Database cleanup »). Désormais : suivi dans la table `schema_migrations` (une migration ne s'applique qu'une fois, backup automatique si quelque chose est en attente), nouvelle commande `leksis migrate`, `update` appelle le `install.sh` du disque (nouvelle version) pour appliquer les migrations, et le cas « aucun composant sélectionné » applique aussi les migrations en attente. Effectif à partir de la beta.6 (l'ancienne version ne peut pas se corriger elle-même).

## Phase 7 : Qualité et évolutions

- [x] ESLint (config Next) — `eslint.config.mjs` (flat config, `npm run lint`) : 0 erreur, 0 avertissement. Vrais défauts corrigés : `NavLink` redéfini à chaque rendu dans `AdminSidebar`, `Date.now()` dans le rendu (3 fichiers), prop `code` inutilisée, et **bug réel** dans `AIRewriteTab` (`sourceLang` figé dans `useCallback` : la langue source choisie était ignorée). `react-hooks/set-state-in-effect` désactivée volontairement (chargement au montage, lecture de `localStorage` après hydratation) ; les `_x` sont ignorés par `no-unused-vars`
- [x] Vitest : tests sur `file-parser`, `network.ts`, `caddy-config`, `prompts`, `tones` — `npm test`, 84 tests dans `tests/unit/` (`vitest.config.mts`, stub `server-only`). Le test DOCX génère un vrai fichier avec `docx` (listes, titres h3, tableau) et échoue si on casse la gestion des listes
- [x] Test de bout en bout du parcours connexion → espace de travail → déconnexion — `npm run test:e2e` (`tests/e2e/journeys.mjs`) : base PGlite en mémoire chargée depuis `init-schema.sql`, serveur Next standalone sur `0.0.0.0` sans `NEXTAUTH_URL` (comme Docker), vrai navigateur (puppeteer-core ; `CHROME_PATH` ou détection Chrome/Chromium/Edge). Vérifie (`tests/e2e/journeys.mjs`) : redirection anonyme, API refusées sans session, connexion, session, déconnexion à la bonne adresse, aucune erreur console (#418). Prérequis : `npm run build`. Vérifié : le test échoue si on remet l'ancien `signOut()`. ⚠️ Sous Windows, Edge ne se lance pas depuis le shell Bash de Claude Code (bac à sable) : le lancer via PowerShell
- [x] Workflow GitHub Actions : `tsc`, lint, tests, `npm audit`, `next build` — `.github/workflows/ci.yml` (push `main`/`dev` + PR, Node 22, en plus : e2e avec `google-chrome` du runner ; audit `--omit=dev --audit-level=high`). Exécuté sur GitHub (push du 2026-09-25) : vert en 1 min 9 s, e2e sous Linux compris ; runner épinglé `ubuntu-24.04`, actions en v5 (Node 20 déprécié). `tests`, configs d'outils et `.github` ajoutés au `.dockerignore`
- [x] Cache mémoire des réglages (TTL court, invalidé dans `updateSetting`) — `lib/settings.ts` : TTL 5 s, vidé à chaque `updateSetting`, une seule requête SQL pour des lectures simultanées, copie indépendante à chaque lecture, pas de cache sur erreur ; une lecture lancée avant une écriture ne remet pas l'ancienne valeur en cache. `getAllSettings` (pages admin) interroge toujours la base. Le TTL couvre les écritures faites hors application (`install.sh` par `psql`). 9 tests Vitest
- [x] Traduction de documents par lots avec contrôle du nombre de `|||` et relance — `src/lib/doc-translate.ts` : lots de 3000 caractères max (entrée + sortie tiennent dans `num_ctx`), vérification du nombre de segments renvoyés, une nouvelle demande puis découpe du lot en deux jusqu'à un segment isolé (jamais de décalage silencieux) ; segments vides non envoyés, `|||` du texte source neutralisé ; le prompt annonce le nombre exact de segments. `blocksToSegments`/`applySegments` remplacent `flattenBlocks`/`applyTranslatedSegments`. Un avertissement serveur (`separators not respected by <modèle>`) est journalisé quand le modèle se trompe. 16 tests Vitest + e2e avec un faux serveur Ollama qui fusionne les séparateurs (traduction restée alignée, document long en 2 appels)
- [x] Gestion des utilisateurs : suppression/désactivation, pagination, protection du dernier admin — colonne `users.disabled` (`docker/migrations/002-user-disabled.sql` + `init-schema.sql`) ; un compte désactivé ne peut plus demander de code ni se connecter et sa session s'arrête (`getUserRole` renvoie null). `lib/users.ts` : `listUsers` (recherche email/nom, pagination 25/page, `%`/`_` littéraux), `changeUser`, `removeUser` dans une transaction avec verrou consultatif : on ne peut pas se rétrograder/désactiver/supprimer soi-même et il reste toujours un admin actif. Routes `GET /api/admin/users`, `PATCH`/`DELETE /api/admin/users/[id]` avec `code` d'erreur stable (`self`, `last_admin`, `not_found`), traduits dans `UserList` ; audit `DISABLE_USER`/`ENABLE_USER`/`DELETE_USER`. `SignInForm` traduit aussi `account_disabled` et `rate_limited`. ⚠️ **Supprimer ne bloque personne** (un compte se recrée à la connexion) : l'interface le dit, désactiver est le vrai blocage. ⚠️ La migration s'applique après le redémarrage de l'app pendant `leksis update` : brève fenêtre où la connexion et la page Utilisateurs échouent tant que la colonne n'existe pas. 10 tests Vitest sur PGlite + scénario e2e admin (désactivation d'un utilisateur connecté). Corrige au passage une erreur d'hydratation #418 de la page Utilisateurs (format de date locale)
- [x] Rétention automatique de `usage_log` et `audit_log` — **usage 365 j, audit 730 j par défaut** (choix de l'utilisateur), réglable dans Admin → Réglages → Général, 0 = garder. `lib/retention.ts` : suppression par lots de 10 000, lancée par `src/instrumentation.ts` 2 min après le démarrage puis toutes les 6 h (`LEKSIS_RETENTION_DELAY_SEC` pour les tests) ; l'opération est inscrite à l'audit (`AUTO_PURGE_USAGE`/`AUTO_PURGE_AUDIT`, utilisateur `system`) après la suppression. ⚠️ Les installations existantes perdent les entrées plus anciennes à la première exécution après la mise à jour. 7 tests Vitest sur PGlite + e2e (le job démarre dans le serveur construit et purge)
- [x] Schéma zod unique des réglages (défauts + validation) partagé PATCH / import / reset — `lib/settings-schema.ts` : PATCH et import partageaient déjà les schémas (phase 4) ; les **défauts** y sont maintenant aussi (`SETTING_DEFAULTS`, limites prises des constantes de `validators.ts`, une seule source) et la réinitialisation les utilise. Un test vérifie que chaque défaut passe son propre schéma. Reste hors du fichier : `DEFAULT_TONES` (`lib/tones.ts`, serveur seul). 14 tests + e2e de la réinitialisation
- [x] Mettre à jour CLAUDE.md (`proxy.ts`, fichiers manquants, suppressions) et l'alléger — 617 → 548 lignes, 68 → 57 Ko : arborescence condensée, nouvelles sections (qualité et tests, réglages, comptes et sessions, base et migrations, documents), sécurité mise à jour, parties obsolètes retirées (adaptateur NextAuth, mode sombre, formulaire PostgreSQL, `middleware.ts`). Sections `install.sh` et releases conservées telles quelles

## Après la beta.6 : retours du test sur la VM

- [x] Journal d'audit : `user:<uuid>` affiché en `user:<email>` (`labelAuditResources`, page d'audit et tableau de bord)
- [x] Carte du moteur IA du tableau de bord : les versions longues (vLLM `0.23.1rc1.dev1029+…`) passent à la ligne au lieu de déborder ; le nom du fournisseur est traduit
- [x] Services → AI : trois cartes **Ollama (ce serveur) / Ollama (autre serveur) / API compatible OpenAI** (le mode se déduit de fournisseur + adresse, rien de nouveau en base). Carte locale grisée si le conteneur ne répond pas (`GET /api/admin/services/ai/local`)
- [x] **Bug corrigé, présent de la beta.1 à la beta.6** : `/^d+$/` (antislash perdu) rendait le contexte Ollama toujours invalide → bouton Enregistrer de Services → AI désactivé pour un serveur Ollama (invisible avec l'API OpenAI). Règle extraite dans `isValidNumCtx` avec test, vérifiée en navigateur. Aucune autre occurrence trouvée dans `src`

## Après la beta.7 : renommage des variables `OLLAMA_*` → `AI_*`

- [x] `OLLAMA_MODEL` / `OLLAMA_OCR_MODEL` / `OLLAMA_REWRITE_MODEL` → `AI_MODEL` / `AI_OCR_MODEL` / `AI_REWRITE_MODEL` (`.env`, compose, `config.ts`, `install.sh`, README, e2e) ; `OLLAMA_BASE_URL` supprimée (copie de `AI_BASE_URL`). Variables internes de `install.sh` : `OLLAMA_MODE` / `OLLAMA_URL` / `OLLAMA_URL_HOSTSIDE` / `OLLAMA_URL_RAW` → `AI_*`. Restent tels quels : `OLLAMA_KEEP_ALIVE`, `OLLAMA_SCHED_SPREAD`, `OLLAMA_MAX_LOADED_MODELS`, `OLLAMA_IMAGE` (réglages du conteneur Ollama)
- [x] Compatibilité : `config.ts` et le compose lisent encore les anciens noms en repli (nécessaire pendant `update`, où l'ancien `install.sh` tourne avec le nouveau compose) ; `migrate_env` renomme le `.env` (une fois, idempotent) ; les clés de réponse `LEKSIS_OLLAMA_MODEL` / `_OCR_MODEL` / `_REWRITE_MODEL` restent acceptées. Testé : `migrate_env` sur 2 `.env` d'anciennes versions + relance, `load_config_from_env`, alias, `.env` généré dans les 3 modes ; `tests/unit/llm-config.test.ts` (échoue si le repli est cassé). **Reste à vérifier sur la VM : `leksis update` depuis la beta.7**

## Livraison

- [ ] Betas `v1.5.1-beta.1` (phases 0-2), `beta.2` (phases 3-4) et `beta.3` (phases 5 + déconnexion + hydratation) , `beta.4` (correctif connexion) `beta.5` (migration base), `beta.6` (phase 7 : utilisateurs, documents par lots, rétention, outillage) et `beta.7` (retours de test : cartes du moteur IA, bouton Enregistrer Ollama, audit) et `beta.8` (renommage `OLLAMA_*` → `AI_*`) publiées — **à tester sur une VM séparée** ; beta.4 après les phases 6-7
- [ ] Bumper `package.json`, `install.sh` et `README.md` ensemble (What's new inclus)
- [ ] Merger `dev` dans `main` et taguer après validation de la beta
