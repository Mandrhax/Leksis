import { DOCUMENT_MAX_BYTES, OCR_MAX_PDF_PAGES } from '@/lib/validators'
import { textToParagraphs, type LegalContext, type LegalDocument, type LegalSection } from '@/lib/legal-content'

const fmt = (n: number) => n.toLocaleString('en-US')

function retention(days: number, what: string): string {
  return days > 0
    ? `${what} are deleted automatically after ${fmt(days)} ${days === 1 ? 'day' : 'days'}.`
    : `${what} are kept until an administrator deletes them.`
}

function orgName(c: LegalContext): string {
  return c.organization || 'the organisation that operates this service'
}

function contactLine(c: LegalContext): string {
  return c.contact
    ? `For any question about this policy or about your data, contact ${c.contact}.`
    : 'For any question about this policy or about your data, contact your administrator.'
}

function enabledFeatureNames(c: LegalContext): string[] {
  return [
    c.features.text     && 'text translation',
    c.features.document && 'document translation (PDF, DOCX, TXT, CSV)',
    c.features.image    && 'text extraction from images (OCR)',
    c.features.rewrite  && 'AI-assisted rewriting and correction',
  ].filter((x): x is string => Boolean(x))
}

function aiDestination(c: LegalContext): LegalSection {
  const always = `Your browser never contacts the AI model directly: every request goes through the ${c.siteName} server, which forwards it to the model.`
  if (c.aiScope === 'external') {
    return {
      id: 'ai-processing',
      title: 'Where your content is processed',
      warning: true,
      paragraphs: [
        `The AI model used by ${c.siteName} is an external service, outside the private network of ${orgName(c)}. The text, documents and images you submit are sent to that service to be processed, and leave the organisation's infrastructure.`,
        'That provider processes the content under its own terms. Ask the contact below which provider is used and how it handles data (retention, training, location) before submitting anything sensitive.',
        always,
      ],
    }
  }
  return {
    id: 'ai-processing',
    title: 'Where your content is processed',
    paragraphs: [
      c.aiScope === 'local'
        ? `The AI model runs on the same server as ${c.siteName}. The text, documents and images you submit are processed there and never leave the infrastructure of ${orgName(c)}.`
        : `The AI model runs on a server inside the private network of ${orgName(c)}. The text, documents and images you submit stay within that network and are not sent to any external service.`,
      always,
    ],
  }
}

export function buildPrivacyPolicy(c: LegalContext): LegalDocument {
  const sections: LegalSection[] = [
    {
      id: 'controller',
      title: 'Who is responsible for your data',
      paragraphs: [
        `${c.siteName} is a translation and rewriting tool installed and operated by ${orgName(c)} on its own infrastructure. That organisation decides why and how your data is processed and is responsible for it.`,
        `The publisher of the ${c.siteName} software has no access to your data. The software does not send usage data, analytics or telemetry to its publisher or to any third party.`,
        contactLine(c),
      ],
    },
    {
      id: 'data',
      title: 'What is processed',
      items: [
        'Account: your email address, your name if one was provided, your role, whether the account is enabled and when it was created.',
        'Sign-in: a one-time code, valid for 10 minutes, and a session that keeps you signed in.',
        'Content you submit: the text, documents and images you translate, extract or rewrite. They are processed in memory to produce the result and are not stored by the application once the request is complete.',
        'Usage log: for each AI request, the date, your email address, the feature used, the languages, the model and the number of characters. The content itself is never recorded.',
        'Audit log: for administrators, a record of administrative actions with the administrator’s email address.',
        'Glossaries: terms defined by administrators, and your choice of which glossaries to switch off.',
      ],
    },
    aiDestination(c),
    {
      id: 'cookies',
      title: 'Cookies and browser storage',
      paragraphs: [
        'The application uses a small number of technical cookies to keep you signed in and to protect sign-in against forged requests. They are strictly necessary and are not used for tracking.',
        'Your browser also stores your preferences locally: interface language, favourite languages and the last target language chosen in each tool. This information stays on your device and is never sent to the server.',
        'There are no advertising or analytics cookies, and no third-party resources (fonts, scripts, trackers) are loaded by your browser.',
      ],
    },
    {
      id: 'retention',
      title: 'How long data is kept',
      items: [
        retention(c.usageRetentionDays, 'Usage log entries'),
        retention(c.auditRetentionDays, 'Audit log entries'),
        'Sign-in codes expire after 10 minutes.',
        'Accounts are kept until an administrator deletes them.',
        'Submitted content is not kept (see above).',
      ],
    },
    {
      id: 'security',
      title: 'How data is protected',
      items: [
        'Access requires signing in with a one-time code, and administrators can disable an account at any time.',
        'Administration pages are restricted to administrators, and administrative actions are logged.',
        'Stored secrets, such as an API key for the AI service, are encrypted and are never shown in the interface or exported.',
        ...(c.limits.rateLimitPerMin > 0 ? ['AI requests are rate-limited per user.'] : []),
        'Connections are encrypted with HTTPS when the administrator has enabled it.',
      ],
    },
    {
      id: 'rights',
      title: 'Your rights',
      paragraphs: [
        'Under data protection law (such as the GDPR in the European Union and the revised Federal Act on Data Protection in Switzerland), you can ask for access to your data, for its correction or deletion, to restrict or object to its processing, and to receive a copy of it. The organisation operating this service decides the legal basis for the processing.',
        'Accounts are created the first time someone signs in. Deleting an account therefore does not by itself prevent the person from signing in again: to block access, an administrator disables the account.',
        `${contactLine(c)} You may also lodge a complaint with the competent data protection authority, for example the Federal Data Protection and Information Commissioner (FDPIC) in Switzerland or your national authority in the European Union.`,
      ],
    },
  ]

  const notes = textToParagraphs(c.privacyNotes)
  if (notes.length > 0) {
    sections.push({ id: 'additional', title: `Additional information from ${orgName(c)}`, paragraphs: notes })
  }

  return {
    title: 'Privacy policy',
    intro: `This page describes how ${c.siteName} handles personal data. It is generated from the current configuration of this installation.`,
    sections,
  }
}

export function buildUsagePolicy(c: LegalContext): LegalDocument {
  const features = enabledFeatureNames(c)
  const l = c.limits

  const sensitive: LegalSection = c.aiScope === 'external'
    ? {
        id: 'confidentiality',
        title: 'Confidential and personal data',
        warning: true,
        paragraphs: [
          `Content submitted to ${c.siteName} is sent to an external AI service outside the private network of ${orgName(c)}. Do not submit anything you are not allowed to share outside the organisation, such as confidential, privileged, classified or special-category personal data, unless the organisation has explicitly approved it.`,
        ],
      }
    : {
        id: 'confidentiality',
        title: 'Confidential and personal data',
        paragraphs: [
          `Content submitted to ${c.siteName} stays within the infrastructure of ${orgName(c)}. You must still follow the organisation’s rules on data classification, and only submit personal data about other people when it is necessary for your work.`,
        ],
      }

  const sections: LegalSection[] = [
    {
      id: 'purpose',
      title: 'Purpose',
      paragraphs: [
        `${c.siteName} is provided by ${orgName(c)} to its authorised users for work purposes.`,
        features.length > 0
          ? `It offers: ${features.join('; ')}.`
          : 'No feature is enabled at the moment.',
        'By signing in you agree to follow this policy.',
      ],
    },
    {
      id: 'acceptable',
      title: 'Acceptable use',
      items: [
        'Use the service for legitimate work purposes.',
        'Only submit content you are entitled to process.',
        'Keep your account to yourself and do not share your sign-in codes.',
        'Check the results before relying on them or sending them to anyone.',
      ],
    },
    {
      id: 'prohibited',
      title: 'What is not allowed',
      items: [
        'Submitting or producing unlawful content, or content that harasses, threatens or discriminates against others.',
        'Processing content that infringes copyright or other rights of third parties.',
        'Using the results to deceive or mislead people.',
        'Trying to bypass sign-in, usage limits or other security measures, or to access another person’s account.',
        'Overloading the service, for example with automated or bulk requests outside the normal interface.',
        'Trying to make the AI model ignore its instructions or reveal them.',
      ],
    },
    sensitive,
    {
      id: 'ai-limits',
      title: 'Limits of AI results',
      paragraphs: [
        'Translations, extracted text and rewritten text are produced by an AI model. They may contain errors, omissions, invented content or changes of meaning, and text recognised from images or scanned documents may be misread.',
        'You remain responsible for what you do with the results. They are not certified translations and should be reviewed by a qualified person for legal, medical, financial or safety-critical content.',
      ],
    },
    {
      id: 'limits',
      title: 'Usage limits',
      items: [
        ...(c.features.text || c.features.rewrite ? [`Text: up to ${fmt(l.maxTextChars)} characters per request.`] : []),
        ...(c.features.document
          ? [`Documents: files up to ${DOCUMENT_MAX_BYTES / (1024 * 1024)} MB and ${fmt(l.maxDocChars)} characters of text; scanned PDFs are read up to ${OCR_MAX_PDF_PAGES} pages.`]
          : []),
        ...(c.features.image ? [`Images: up to ${l.maxImageMB} MB per image.`] : []),
        l.rateLimitPerMin > 0
          ? `Requests: up to ${fmt(l.rateLimitPerMin)} AI requests per minute per user.`
          : 'Requests: no per-minute limit is set.',
      ],
    },
    {
      id: 'monitoring',
      title: 'Monitoring',
      paragraphs: [
        'Your use of the service is logged: who used which feature, when, in which languages and how many characters. The content you submit is not recorded. Administrators can see these logs. See the privacy policy for details.',
      ],
    },
    {
      id: 'enforcement',
      title: 'Consequences',
      paragraphs: [
        'An administrator may disable an account that does not respect this policy. The organisation may take further measures under its own rules.',
      ],
    },
  ]

  const rules = textToParagraphs(c.usageRules)
  if (rules.length > 0) {
    sections.push({ id: 'additional', title: `Additional rules from ${orgName(c)}`, paragraphs: rules })
  }
  sections.push({ id: 'contact', title: 'Questions', paragraphs: [contactLine(c)] })

  return {
    title: 'Usage policy',
    intro: `This page sets out the rules for using ${c.siteName}. It is generated from the current configuration of this installation.`,
    sections,
  }
}
