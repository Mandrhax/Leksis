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
- [ ] HSTS : à ajouter côté Caddy en mode HTTPS seulement (après validation que le retour en HTTP n'est plus prévu) — non fait volontairement

## Phase 5 : Code mort et doublons

- [ ] Supprimer `AdminToastWrapper.tsx`, `NO_CAPABILITIES`, `validateDocumentInput` (déjà fait en Phase 2), `RewriteTone`
- [ ] Supprimer le type `html` de `Block` et ses branches (file-parser ×3, DocumentStudioTab ×2)
- [ ] Supprimer le réglage `seo` (PATCH, reset, export)
- [ ] Factoriser les helpers de parsing de tables HTML (`file-parser` / `pdf-vision`)
- [x] Fusionner les routes logo et background dans un helper commun — fait en Phase 4 (`site-assets.ts`)
- [ ] Simplifier `fetchGlossaryEntries` (une requête paramétrée, retirer le `JOIN glossaries` inutile)
- [ ] `getAiPublicConfig` : une seule lecture de base
- [ ] Corriger les commentaires périmés (`prompts.ts`, `settings.ts`, `file-parser.ts` + `import 'server-only'`)
- [ ] `pool.on('error')`, `max`, `statement_timeout` dans `db.ts`
- [ ] Supprimer le dossier vide `Prompt/`
- [ ] Uniformiser la langue des messages d'API (EN)

## Phase 6 : Base de données (migration requise)

- [ ] Vérifier que `PostgresAdapter` ne sert à rien (tester le login sans lui)
- [ ] Si oui : le retirer, puis supprimer `accounts`, `sessions`, `verification_token`, colonnes `emailVerified`/`image`
- [ ] Écrire la migration dans `install.sh` (`update`) — y inclure `DELETE FROM site_settings WHERE key IN ('db_config', 'ollama_config' si ai_config existe)` : `db_config` contient encore un mot de passe chiffré inutilisé

## Phase 7 : Qualité et évolutions

- [ ] ESLint (config Next)
- [ ] Vitest : tests sur `file-parser`, `network.ts`, `caddy-config`, `prompts`, `tones`
- [ ] Workflow GitHub Actions : `tsc`, lint, tests, `npm audit`, `next build`
- [ ] Cache mémoire des réglages (TTL court, invalidé dans `updateSetting`)
- [ ] Traduction de documents par lots avec contrôle du nombre de `|||` et relance
- [ ] Gestion des utilisateurs : suppression/désactivation, pagination, protection du dernier admin
- [ ] Rétention automatique de `usage_log` et `audit_log`
- [ ] Schéma zod unique des réglages (défauts + validation) partagé PATCH / import / reset
- [ ] Mettre à jour CLAUDE.md (`proxy.ts`, fichiers manquants, suppressions) et l'alléger

## Livraison

- [ ] Betas `v1.5.1-beta.1` (phases 0-2) et `v1.5.1-beta.2` (phases 3-4) publiées — **à tester sur une VM séparée** ; beta.3 après les phases 5-7
- [ ] Bumper `package.json`, `install.sh` et `README.md` ensemble (What's new inclus)
- [ ] Merger `dev` dans `main` et taguer après validation de la beta
