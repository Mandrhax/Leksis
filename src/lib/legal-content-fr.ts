import { DOCUMENT_MAX_BYTES, OCR_MAX_PDF_PAGES } from '@/lib/validators'
import { textToParagraphs, type LegalContext, type LegalDocument, type LegalSection } from '@/lib/legal-content'

const fmt = (n: number) => n.toLocaleString('fr-FR')

function retention(days: number, what: string): string {
  return days > 0
    ? `${what} sont supprimées automatiquement après ${fmt(days)} ${days === 1 ? 'jour' : 'jours'}.`
    : `${what} sont conservées jusqu’à leur suppression par un administrateur.`
}

function orgName(c: LegalContext): string {
  return c.organization || 'l’organisation qui exploite ce service'
}

function contactLine(c: LegalContext): string {
  return c.contact
    ? `Pour toute question sur cette politique ou sur vos données, contactez ${c.contact}.`
    : 'Pour toute question sur cette politique ou sur vos données, contactez votre administrateur.'
}

function enabledFeatureNames(c: LegalContext): string[] {
  return [
    c.features.text     && 'la traduction de texte',
    c.features.document && 'la traduction de documents (PDF, DOCX, TXT, CSV)',
    c.features.image    && 'l’extraction de texte depuis des images (OCR)',
    c.features.rewrite  && 'la réécriture et la correction assistées par IA',
  ].filter((x): x is string => Boolean(x))
}

function aiDestination(c: LegalContext): LegalSection {
  const always = `Votre navigateur ne contacte jamais le modèle d’IA directement : chaque requête passe par le serveur ${c.siteName}, qui la transmet au modèle.`
  if (c.aiScope === 'external') {
    return {
      id: 'ai-processing',
      title: 'Où votre contenu est traité',
      warning: true,
      paragraphs: [
        `Le modèle d’IA utilisé par ${c.siteName} est un service externe, situé hors du réseau privé de ${orgName(c)}. Le texte, les documents et les images que vous soumettez sont envoyés à ce service pour être traités, et quittent l’infrastructure de l’organisation.`,
        'Ce fournisseur traite le contenu selon ses propres conditions. Demandez au contact ci-dessous quel fournisseur est utilisé et comment il traite les données (conservation, entraînement, localisation) avant de soumettre un contenu sensible.',
        always,
      ],
    }
  }
  return {
    id: 'ai-processing',
    title: 'Où votre contenu est traité',
    paragraphs: [
      c.aiScope === 'local'
        ? `Le modèle d’IA fonctionne sur le même serveur que ${c.siteName}. Le texte, les documents et les images que vous soumettez y sont traités et ne quittent jamais l’infrastructure de ${orgName(c)}.`
        : `Le modèle d’IA fonctionne sur un serveur situé dans le réseau privé de ${orgName(c)}. Le texte, les documents et les images que vous soumettez restent dans ce réseau et ne sont envoyés à aucun service externe.`,
      always,
    ],
  }
}

export function buildPrivacyPolicy(c: LegalContext): LegalDocument {
  const sections: LegalSection[] = [
    {
      id: 'controller',
      title: 'Qui est responsable de vos données',
      paragraphs: [
        `${c.siteName} est un outil de traduction et de réécriture installé et exploité par ${orgName(c)} sur sa propre infrastructure. Cette organisation décide pourquoi et comment vos données sont traitées, et en est responsable.`,
        `L’éditeur du logiciel ${c.siteName} n’a accès à aucune de vos données. Le logiciel n’envoie aucune donnée d’usage, statistique ou de télémétrie à son éditeur ni à un tiers quelconque.`,
        contactLine(c),
      ],
    },
    {
      id: 'data',
      title: 'Ce qui est traité',
      items: [
        'Compte : votre adresse e-mail, votre nom s’il a été renseigné, votre rôle, l’état activé/désactivé du compte et sa date de création.',
        'Connexion : un code à usage unique, valable 10 minutes, et une session qui vous garde connecté(e).',
        'Contenu que vous soumettez : le texte, les documents et les images que vous traduisez, extrayez ou réécrivez. Ils sont traités en mémoire pour produire le résultat et ne sont pas stockés par l’application une fois la requête terminée.',
        'Journal d’usage : pour chaque requête IA, la date, votre adresse e-mail, la fonctionnalité utilisée, les langues, le modèle et le nombre de caractères. Le contenu lui-même n’est jamais enregistré.',
        'Journal d’audit : pour les administrateurs, un enregistrement des actions administratives avec l’adresse e-mail de l’administrateur.',
        'Glossaires : les termes définis par les administrateurs, et votre choix des glossaires à désactiver.',
      ],
    },
    aiDestination(c),
    {
      id: 'cookies',
      title: 'Cookies et stockage du navigateur',
      paragraphs: [
        'L’application utilise un petit nombre de cookies techniques pour vous garder connecté(e) et protéger la connexion contre les requêtes falsifiées. Ils sont strictement nécessaires et ne servent pas au suivi.',
        'Votre navigateur stocke aussi vos préférences localement : langue de l’interface, langues favorites et dernière langue cible choisie dans chaque outil. Ces informations restent sur votre appareil et ne sont jamais envoyées au serveur.',
        'Il n’y a aucun cookie publicitaire ou statistique, et aucune ressource tierce (polices, scripts, traceurs) n’est chargée par votre navigateur.',
      ],
    },
    {
      id: 'retention',
      title: 'Durée de conservation des données',
      items: [
        retention(c.usageRetentionDays, 'Les entrées du journal d’usage'),
        retention(c.auditRetentionDays, 'Les entrées du journal d’audit'),
        'Les codes de connexion expirent après 10 minutes.',
        'Les comptes sont conservés jusqu’à leur suppression par un administrateur.',
        'Le contenu soumis n’est pas conservé (voir ci-dessus).',
      ],
    },
    {
      id: 'security',
      title: 'Comment les données sont protégées',
      items: [
        'L’accès nécessite une connexion par code à usage unique, et les administrateurs peuvent désactiver un compte à tout moment.',
        'Les pages d’administration sont réservées aux administrateurs, et les actions administratives sont journalisées.',
        'Les secrets stockés, comme une clé d’API pour le service IA, sont chiffrés et ne sont jamais affichés dans l’interface ni exportés.',
        ...(c.limits.rateLimitPerMin > 0 ? ['Les requêtes IA sont soumises à une limite de débit par utilisateur.'] : []),
        'Les connexions sont chiffrées en HTTPS lorsque l’administrateur l’a activé.',
      ],
    },
    {
      id: 'rights',
      title: 'Vos droits',
      paragraphs: [
        'En vertu du droit de la protection des données (comme le RGPD dans l’Union européenne et la loi fédérale sur la protection des données révisée en Suisse), vous pouvez demander l’accès à vos données, leur correction ou leur suppression, la limitation ou l’opposition à leur traitement, et en recevoir une copie. L’organisation qui exploite ce service détermine la base légale du traitement.',
        'Les comptes sont créés à la première connexion. Supprimer un compte n’empêche donc pas en soi la personne de se reconnecter par la suite : pour bloquer l’accès, un administrateur désactive le compte.',
        `${contactLine(c)} Vous pouvez également déposer une plainte auprès de l’autorité compétente en matière de protection des données, par exemple le Préposé fédéral à la protection des données et à la transparence (PFPDT) en Suisse ou votre autorité nationale dans l’Union européenne.`,
      ],
    },
  ]

  const notes = textToParagraphs(c.privacyNotes)
  if (notes.length > 0) {
    sections.push({ id: 'additional', title: `Informations complémentaires de ${orgName(c)}`, paragraphs: notes })
  }

  return {
    title: 'Politique de confidentialité',
    intro: `Cette page décrit comment ${c.siteName} traite les données personnelles. Elle est générée à partir de la configuration actuelle de cette installation.`,
    sections,
  }
}

export function buildUsagePolicy(c: LegalContext): LegalDocument {
  const features = enabledFeatureNames(c)
  const l = c.limits

  const sensitive: LegalSection = c.aiScope === 'external'
    ? {
        id: 'confidentiality',
        title: 'Données confidentielles et personnelles',
        warning: true,
        paragraphs: [
          `Le contenu soumis à ${c.siteName} est envoyé à un service d’IA externe, situé hors du réseau privé de ${orgName(c)}. Ne soumettez rien que vous n’êtes pas autorisé(e) à partager hors de l’organisation, comme des données confidentielles, protégées, classifiées ou des catégories particulières de données personnelles, sauf approbation explicite de l’organisation.`,
        ],
      }
    : {
        id: 'confidentiality',
        title: 'Données confidentielles et personnelles',
        paragraphs: [
          `Le contenu soumis à ${c.siteName} reste dans l’infrastructure de ${orgName(c)}. Vous devez néanmoins respecter les règles de classification des données de l’organisation, et ne soumettre des données personnelles sur d’autres personnes que lorsque c’est nécessaire pour votre travail.`,
        ],
      }

  const sections: LegalSection[] = [
    {
      id: 'purpose',
      title: 'Objet',
      paragraphs: [
        `${c.siteName} est mis à disposition par ${orgName(c)} à ses utilisateurs autorisés, à des fins professionnelles.`,
        features.length > 0
          ? `Il propose : ${features.join(' ; ')}.`
          : 'Aucune fonctionnalité n’est activée pour le moment.',
        'En vous connectant, vous acceptez de respecter cette politique.',
      ],
    },
    {
      id: 'acceptable',
      title: 'Usage autorisé',
      items: [
        'Utiliser le service à des fins professionnelles légitimes.',
        'Ne soumettre que du contenu que vous êtes habilité(e) à traiter.',
        'Garder votre compte personnel et ne pas partager vos codes de connexion.',
        'Vérifier les résultats avant de vous y fier ou de les transmettre à quelqu’un.',
      ],
    },
    {
      id: 'prohibited',
      title: 'Ce qui n’est pas autorisé',
      items: [
        'Soumettre ou produire du contenu illicite, ou du contenu qui harcèle, menace ou discrimine autrui.',
        'Traiter du contenu qui enfreint le droit d’auteur ou d’autres droits de tiers.',
        'Utiliser les résultats pour tromper ou induire des personnes en erreur.',
        'Tenter de contourner la connexion, les limites d’usage ou d’autres mesures de sécurité, ou d’accéder au compte d’une autre personne.',
        'Surcharger le service, par exemple avec des requêtes automatisées ou massives en dehors de l’interface normale.',
        'Tenter de faire ignorer au modèle d’IA ses instructions ou de les lui faire révéler.',
      ],
    },
    sensitive,
    {
      id: 'ai-limits',
      title: 'Limites des résultats de l’IA',
      paragraphs: [
        'Les traductions, le texte extrait et le texte réécrit sont produits par un modèle d’IA. Ils peuvent contenir des erreurs, des omissions, du contenu inventé ou des changements de sens, et le texte reconnu à partir d’images ou de documents numérisés peut être mal lu.',
        'Vous restez responsable de l’usage que vous faites des résultats. Ce ne sont pas des traductions certifiées ; elles doivent être relues par une personne qualifiée pour tout contenu juridique, médical, financier ou critique pour la sécurité.',
      ],
    },
    {
      id: 'limits',
      title: 'Limites d’usage',
      items: [
        ...(c.features.text || c.features.rewrite ? [`Texte : jusqu’à ${fmt(l.maxTextChars)} caractères par requête.`] : []),
        ...(c.features.document
          ? [`Documents : fichiers jusqu’à ${DOCUMENT_MAX_BYTES / (1024 * 1024)} Mo et ${fmt(l.maxDocChars)} caractères de texte ; les PDF numérisés sont lus jusqu’à ${OCR_MAX_PDF_PAGES} pages.`]
          : []),
        ...(c.features.image ? [`Images : jusqu’à ${l.maxImageMB} Mo par image.`] : []),
        l.rateLimitPerMin > 0
          ? `Requêtes : jusqu’à ${fmt(l.rateLimitPerMin)} requêtes IA par minute et par utilisateur.`
          : 'Requêtes : aucune limite par minute n’est définie.',
      ],
    },
    {
      id: 'monitoring',
      title: 'Suivi de l’usage',
      paragraphs: [
        'Votre usage du service est journalisé : qui a utilisé quelle fonctionnalité, quand, dans quelles langues et pour combien de caractères. Le contenu que vous soumettez n’est pas enregistré. Les administrateurs peuvent consulter ces journaux. Voir la politique de confidentialité pour plus de détails.',
      ],
    },
    {
      id: 'enforcement',
      title: 'Conséquences',
      paragraphs: [
        'Un administrateur peut désactiver un compte qui ne respecte pas cette politique. L’organisation peut prendre d’autres mesures selon ses propres règles.',
      ],
    },
  ]

  const rules = textToParagraphs(c.usageRules)
  if (rules.length > 0) {
    sections.push({ id: 'additional', title: `Règles complémentaires de ${orgName(c)}`, paragraphs: rules })
  }
  sections.push({ id: 'contact', title: 'Questions', paragraphs: [contactLine(c)] })

  return {
    title: 'Conditions d’utilisation',
    intro: `Cette page fixe les règles d’utilisation de ${c.siteName}. Elle est générée à partir de la configuration actuelle de cette installation.`,
    sections,
  }
}
