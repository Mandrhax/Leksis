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
- [ ] Ollama : définir `num_ctx` — **en attente de la valeur choisie par l'utilisateur** (selon la VRAM)
- [x] `extract/document` : garde de fonctionnalité + `getDynamicLimits()` au lieu de la constante
- [x] Supprimer `.doc` : `validators.ts`, `parseFile`, `accept=` dans `DocumentStudioTab`, README
- [x] `<html lang>` selon la locale d'interface (au lieu de `fr` en dur)
- [x] Écran de maintenance en i18n (nouveau `MaintenanceScreen`, namespace `maintenance` dans les 4 locales) ; `app/maintenance/page.tsx` supprimée (route orpheline jamais utilisée)
- [x] Page Usage : agrégation en SQL, validation `from`/`to` (400), `parseInt` sur `page` dans l'audit
- [x] Import de glossaires dans une transaction

## Phase 2 : Sécurité des routes

- [ ] Garde commun `requireUser()` (401 JSON) dans les 6 routes IA/export (S2)
- [ ] Y intégrer le mode maintenance : 503 pour les non-admins
- [ ] Rate-limit par utilisateur sur translate, rewrite, ocr, translate/document, extract/document (seuils à choisir avec l'utilisateur)
- [ ] Rate-limit sur `/api/auth/otp`
- [ ] Plafond de taille : fichiers, JSON export docx, import de config ; Caddy `request_body max_size` (Caddyfile + `caddy-config.ts` + `install.sh` identiques)
- [ ] Plafond de pages pour l'OCR de PDF scanné + `pdf.destroy()`
- [ ] Export docx : nettoyer `filename` (RFC 5987), valider la taille des `blocks`
- [ ] Valider `sourceLang`/`targetLang` avant les prompts
- [ ] Export CSV usage : neutraliser les formules, guillemets sur les champs
- [ ] Ne plus renvoyer `err.message` au client (logo, background, users/[id], extraction)
- [ ] Supprimer les `console.log` de debug de logo et background

## Phase 3 : Sessions, audit, OTP

- [ ] Relire le rôle en base (cache court) pour que la rétrogradation soit immédiate
- [ ] OTP : `crypto.randomInt`, vérification atomique, format d'email, purge des `otp_tokens` expirés
- [ ] Journaliser les purges audit/usage sans effacer leur propre trace
- [ ] `logAudit` : au minimum un `console.error` en cas d'échec

## Phase 4 : Réglages, images, en-têtes

- [ ] Schémas zod pour `branding`, `design`, `general`, `features` (couleurs hex, URLs http(s), nombres bornés)
- [ ] Mêmes schémas dans l'import de config
- [ ] Import d'images : plafond de taille + magic bytes
- [ ] `site-assets` : `Content-Security-Policy: sandbox` + `nosniff`
- [ ] Logo/background : magic bytes, refus ou nettoyage du SVG
- [ ] En-têtes de sécurité dans `next.config.mjs` (CSP, X-Frame-Options, Referrer-Policy, `poweredByHeader: false`)
- [ ] Docker : `no-new-privileges`, `cap_drop: [ALL]` sur `app`, épingler les versions ollama/caddy
- [ ] PostgreSQL (option A) : supprimer l'onglet Connection, `DbServiceForm`, `db/test`, et `db_config` (PATCH, export, import, page)

## Phase 5 : Code mort et doublons

- [ ] Supprimer `AdminToastWrapper.tsx`, `NO_CAPABILITIES`, `validateDocumentInput`, `RewriteTone`
- [ ] Supprimer le type `html` de `Block` et ses branches (file-parser ×3, DocumentStudioTab ×2)
- [ ] Supprimer le réglage `seo` (PATCH, reset, export)
- [ ] Factoriser les helpers de parsing de tables HTML (`file-parser` / `pdf-vision`)
- [ ] Fusionner les routes logo et background dans un helper commun (règle aussi les 9 warnings de build « Dynamic filesystem access » : logo, background, export, reset)
- [ ] Simplifier `fetchGlossaryEntries` (une requête paramétrée, retirer le `JOIN glossaries` inutile)
- [ ] `getAiPublicConfig` : une seule lecture de base
- [ ] Corriger les commentaires périmés (`prompts.ts`, `settings.ts`, `file-parser.ts` + `import 'server-only'`)
- [ ] `pool.on('error')`, `max`, `statement_timeout` dans `db.ts`
- [ ] Supprimer le dossier vide `Prompt/`
- [ ] Uniformiser la langue des messages d'API (EN)

## Phase 6 : Base de données (migration requise)

- [ ] Vérifier que `PostgresAdapter` ne sert à rien (tester le login sans lui)
- [ ] Si oui : le retirer, puis supprimer `accounts`, `sessions`, `verification_token`, colonnes `emailVerified`/`image`
- [ ] Écrire la migration dans `install.sh` (`update`)

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

- [ ] Beta `v1.5.1-beta.1` après les phases 0 à 3, testée sur une VM séparée
- [ ] Bumper `package.json`, `install.sh` et `README.md` ensemble (What's new inclus)
- [ ] Merger `dev` dans `main` et taguer après validation de la beta
