import { DOCUMENT_MAX_BYTES, OCR_MAX_PDF_PAGES } from '@/lib/validators'
import { textToParagraphs, type LegalContext, type LegalDocument, type LegalSection } from '@/lib/legal-content'

const fmt = (n: number) => n.toLocaleString('de-DE')

function retention(days: number, what: string): string {
  return days > 0
    ? `${what} werden nach ${fmt(days)} ${days === 1 ? 'Tag' : 'Tagen'} automatisch gelöscht.`
    : `${what} werden aufbewahrt, bis ein Administrator sie löscht.`
}

function orgName(c: LegalContext): string {
  return c.organization || 'die Organisation, die diesen Dienst betreibt'
}

function contactLine(c: LegalContext): string {
  return c.contact
    ? `Bei Fragen zu dieser Richtlinie oder zu Ihren Daten wenden Sie sich an ${c.contact}.`
    : 'Bei Fragen zu dieser Richtlinie oder zu Ihren Daten wenden Sie sich an Ihren Administrator.'
}

function enabledFeatureNames(c: LegalContext): string[] {
  return [
    c.features.text     && 'Textübersetzung',
    c.features.document && 'Dokumentübersetzung (PDF, DOCX, TXT, CSV)',
    c.features.image    && 'Texterkennung aus Bildern (OCR)',
    c.features.rewrite  && 'KI-gestütztes Umformulieren und Korrigieren',
  ].filter((x): x is string => Boolean(x))
}

function aiDestination(c: LegalContext): LegalSection {
  const always = `Ihr Browser kontaktiert das KI-Modell nie direkt: Jede Anfrage läuft über den ${c.siteName}-Server, der sie an das Modell weiterleitet.`
  if (c.aiScope === 'external') {
    return {
      id: 'ai-processing',
      title: 'Wo Ihre Inhalte verarbeitet werden',
      warning: true,
      paragraphs: [
        `Das von ${c.siteName} verwendete KI-Modell ist ein externer Dienst außerhalb des privaten Netzwerks von ${orgName(c)}. Der Text, die Dokumente und die Bilder, die Sie einreichen, werden zur Verarbeitung an diesen Dienst gesendet und verlassen die Infrastruktur der Organisation.`,
        'Dieser Anbieter verarbeitet die Inhalte nach seinen eigenen Bedingungen. Fragen Sie den unten genannten Kontakt, welcher Anbieter verwendet wird und wie er mit Daten umgeht (Aufbewahrung, Training, Standort), bevor Sie etwas Sensibles einreichen.',
        always,
      ],
    }
  }
  return {
    id: 'ai-processing',
    title: 'Wo Ihre Inhalte verarbeitet werden',
    paragraphs: [
      c.aiScope === 'local'
        ? `Das KI-Modell läuft auf demselben Server wie ${c.siteName}. Der Text, die Dokumente und die Bilder, die Sie einreichen, werden dort verarbeitet und verlassen die Infrastruktur von ${orgName(c)} nie.`
        : `Das KI-Modell läuft auf einem Server innerhalb des privaten Netzwerks von ${orgName(c)}. Der Text, die Dokumente und die Bilder, die Sie einreichen, bleiben in diesem Netzwerk und werden an keinen externen Dienst gesendet.`,
      always,
    ],
  }
}

export function buildPrivacyPolicy(c: LegalContext): LegalDocument {
  const sections: LegalSection[] = [
    {
      id: 'controller',
      title: 'Wer für Ihre Daten verantwortlich ist',
      paragraphs: [
        `${c.siteName} ist ein Übersetzungs- und Umformulierungswerkzeug, das von ${orgName(c)} auf eigener Infrastruktur installiert und betrieben wird. Diese Organisation entscheidet, warum und wie Ihre Daten verarbeitet werden, und ist dafür verantwortlich.`,
        `Der Herausgeber der Software ${c.siteName} hat keinen Zugriff auf Ihre Daten. Die Software sendet keine Nutzungsdaten, Analysen oder Telemetriedaten an ihren Herausgeber oder an Dritte.`,
        contactLine(c),
      ],
    },
    {
      id: 'data',
      title: 'Was verarbeitet wird',
      items: [
        'Konto: Ihre E-Mail-Adresse, Ihr Name, falls angegeben, Ihre Rolle, ob das Konto aktiviert ist und wann es erstellt wurde.',
        'Anmeldung: ein Einmalcode, gültig für 10 Minuten, und eine Sitzung, die Sie angemeldet hält.',
        'Von Ihnen eingereichte Inhalte: der Text, die Dokumente und die Bilder, die Sie übersetzen, extrahieren oder umformulieren. Sie werden im Arbeitsspeicher verarbeitet, um das Ergebnis zu erzeugen, und werden nach Abschluss der Anfrage nicht von der Anwendung gespeichert.',
        'Nutzungsprotokoll: für jede KI-Anfrage das Datum, Ihre E-Mail-Adresse, die verwendete Funktion, die Sprachen, das Modell und die Anzahl der Zeichen. Der Inhalt selbst wird nie erfasst.',
        'Audit-Protokoll: für Administratoren eine Aufzeichnung administrativer Aktionen mit der E-Mail-Adresse des Administrators.',
        'Glossare: von Administratoren definierte Begriffe sowie Ihre Wahl, welche Glossare Sie deaktivieren.',
      ],
    },
    aiDestination(c),
    {
      id: 'cookies',
      title: 'Cookies und Browserspeicher',
      paragraphs: [
        'Die Anwendung verwendet eine kleine Anzahl technischer Cookies, um Sie angemeldet zu halten und die Anmeldung vor gefälschten Anfragen zu schützen. Sie sind unbedingt erforderlich und dienen nicht dem Tracking.',
        'Ihr Browser speichert außerdem Ihre Einstellungen lokal: Oberflächensprache, bevorzugte Sprachen und die zuletzt gewählte Zielsprache in jedem Werkzeug. Diese Angaben verbleiben auf Ihrem Gerät und werden nie an den Server gesendet.',
        'Es gibt keine Werbe- oder Analyse-Cookies, und Ihr Browser lädt keine Ressourcen von Dritten (Schriften, Skripte, Tracker).',
      ],
    },
    {
      id: 'retention',
      title: 'Wie lange Daten aufbewahrt werden',
      items: [
        retention(c.usageRetentionDays, 'Einträge des Nutzungsprotokolls'),
        retention(c.auditRetentionDays, 'Einträge des Audit-Protokolls'),
        'Anmeldecodes laufen nach 10 Minuten ab.',
        'Konten werden aufbewahrt, bis ein Administrator sie löscht.',
        'Eingereichte Inhalte werden nicht aufbewahrt (siehe oben).',
      ],
    },
    {
      id: 'security',
      title: 'Wie Daten geschützt werden',
      items: [
        'Der Zugriff erfordert eine Anmeldung mit einem Einmalcode, und Administratoren können ein Konto jederzeit deaktivieren.',
        'Administrationsseiten sind Administratoren vorbehalten, und administrative Aktionen werden protokolliert.',
        'Gespeicherte Geheimnisse, wie ein API-Schlüssel für den KI-Dienst, werden verschlüsselt und nie in der Oberfläche angezeigt oder exportiert.',
        ...(c.limits.rateLimitPerMin > 0 ? ['KI-Anfragen unterliegen einer Ratenbegrenzung pro Benutzer.'] : []),
        'Verbindungen werden mit HTTPS verschlüsselt, sobald der Administrator dies aktiviert hat.',
      ],
    },
    {
      id: 'rights',
      title: 'Ihre Rechte',
      paragraphs: [
        'Nach geltendem Datenschutzrecht (wie der DSGVO in der Europäischen Union und dem revidierten Bundesgesetz über den Datenschutz in der Schweiz) können Sie Auskunft über Ihre Daten, deren Berichtigung oder Löschung, die Einschränkung oder den Widerspruch gegen ihre Verarbeitung sowie eine Kopie davon verlangen. Die Organisation, die diesen Dienst betreibt, bestimmt die Rechtsgrundlage der Verarbeitung.',
        'Konten werden bei der ersten Anmeldung erstellt. Das Löschen eines Kontos verhindert daher für sich allein nicht, dass sich die Person erneut anmeldet: Um den Zugriff zu sperren, deaktiviert ein Administrator das Konto.',
        `${contactLine(c)} Sie können außerdem bei der zuständigen Datenschutzbehörde Beschwerde einreichen, zum Beispiel beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB) in der Schweiz oder bei Ihrer nationalen Behörde in der Europäischen Union.`,
      ],
    },
  ]

  const notes = textToParagraphs(c.privacyNotes)
  if (notes.length > 0) {
    sections.push({ id: 'additional', title: `Zusätzliche Informationen von ${orgName(c)}`, paragraphs: notes })
  }

  return {
    title: 'Datenschutzerklärung',
    intro: `Diese Seite beschreibt, wie ${c.siteName} personenbezogene Daten verarbeitet. Sie wird aus der aktuellen Konfiguration dieser Installation erzeugt.`,
    sections,
  }
}

export function buildUsagePolicy(c: LegalContext): LegalDocument {
  const features = enabledFeatureNames(c)
  const l = c.limits

  const sensitive: LegalSection = c.aiScope === 'external'
    ? {
        id: 'confidentiality',
        title: 'Vertrauliche und personenbezogene Daten',
        warning: true,
        paragraphs: [
          `Inhalte, die an ${c.siteName} übermittelt werden, werden an einen externen KI-Dienst außerhalb des privaten Netzwerks von ${orgName(c)} gesendet. Reichen Sie nichts ein, das Sie nicht außerhalb der Organisation weitergeben dürfen, wie vertrauliche, geschützte, klassifizierte oder besonders schützenswerte personenbezogene Daten, sofern die Organisation dies nicht ausdrücklich genehmigt hat.`,
        ],
      }
    : {
        id: 'confidentiality',
        title: 'Vertrauliche und personenbezogene Daten',
        paragraphs: [
          `Inhalte, die an ${c.siteName} übermittelt werden, bleiben innerhalb der Infrastruktur von ${orgName(c)}. Sie müssen trotzdem die Regeln der Organisation zur Datenklassifizierung einhalten und personenbezogene Daten über andere Personen nur einreichen, wenn dies für Ihre Arbeit erforderlich ist.`,
        ],
      }

  const sections: LegalSection[] = [
    {
      id: 'purpose',
      title: 'Zweck',
      paragraphs: [
        `${c.siteName} wird von ${orgName(c)} seinen berechtigten Benutzern für berufliche Zwecke zur Verfügung gestellt.`,
        features.length > 0
          ? `Es bietet: ${features.join('; ')}.`
          : 'Derzeit ist keine Funktion aktiviert.',
        'Mit der Anmeldung erklären Sie sich mit dieser Richtlinie einverstanden.',
      ],
    },
    {
      id: 'acceptable',
      title: 'Zulässige Nutzung',
      items: [
        'Den Dienst für rechtmäßige berufliche Zwecke nutzen.',
        'Nur Inhalte einreichen, zu deren Verarbeitung Sie berechtigt sind.',
        'Ihr Konto für sich behalten und Ihre Anmeldecodes nicht weitergeben.',
        'Die Ergebnisse prüfen, bevor Sie sich darauf verlassen oder sie an jemanden weitergeben.',
      ],
    },
    {
      id: 'prohibited',
      title: 'Was nicht erlaubt ist',
      items: [
        'Rechtswidrige Inhalte einreichen oder erzeugen, oder Inhalte, die andere belästigen, bedrohen oder diskriminieren.',
        'Inhalte verarbeiten, die das Urheberrecht oder andere Rechte Dritter verletzen.',
        'Die Ergebnisse verwenden, um Personen zu täuschen oder in die Irre zu führen.',
        'Versuchen, die Anmeldung, Nutzungsbegrenzungen oder andere Sicherheitsmaßnahmen zu umgehen, oder auf das Konto einer anderen Person zuzugreifen.',
        'Den Dienst überlasten, zum Beispiel mit automatisierten oder massenhaften Anfragen außerhalb der normalen Oberfläche.',
        'Versuchen, das KI-Modell dazu zu bringen, seine Anweisungen zu ignorieren oder offenzulegen.',
      ],
    },
    sensitive,
    {
      id: 'ai-limits',
      title: 'Grenzen der KI-Ergebnisse',
      paragraphs: [
        'Übersetzungen, extrahierter Text und umformulierter Text werden von einem KI-Modell erzeugt. Sie können Fehler, Auslassungen, erfundene Inhalte oder Bedeutungsverschiebungen enthalten, und aus Bildern oder gescannten Dokumenten erkannter Text kann falsch gelesen werden.',
        'Sie bleiben verantwortlich für die Nutzung der Ergebnisse. Es handelt sich nicht um beglaubigte Übersetzungen; sie sollten bei rechtlichen, medizinischen, finanziellen oder sicherheitskritischen Inhalten von einer qualifizierten Person geprüft werden.',
      ],
    },
    {
      id: 'limits',
      title: 'Nutzungsgrenzen',
      items: [
        ...(c.features.text || c.features.rewrite ? [`Text: bis zu ${fmt(l.maxTextChars)} Zeichen pro Anfrage.`] : []),
        ...(c.features.document
          ? [`Dokumente: Dateien bis ${DOCUMENT_MAX_BYTES / (1024 * 1024)} MB und ${fmt(l.maxDocChars)} Zeichen Text; gescannte PDFs werden bis zu ${OCR_MAX_PDF_PAGES} Seiten gelesen.`]
          : []),
        ...(c.features.image ? [`Bilder: bis zu ${l.maxImageMB} MB pro Bild.`] : []),
        l.rateLimitPerMin > 0
          ? `Anfragen: bis zu ${fmt(l.rateLimitPerMin)} KI-Anfragen pro Minute und Benutzer.`
          : 'Anfragen: Es ist keine Begrenzung pro Minute festgelegt.',
      ],
    },
    {
      id: 'monitoring',
      title: 'Überwachung',
      paragraphs: [
        'Ihre Nutzung des Dienstes wird protokolliert: wer welche Funktion wann, in welchen Sprachen und mit wie vielen Zeichen genutzt hat. Der von Ihnen eingereichte Inhalt wird nicht erfasst. Administratoren können diese Protokolle einsehen. Einzelheiten finden Sie in der Datenschutzerklärung.',
      ],
    },
    {
      id: 'enforcement',
      title: 'Konsequenzen',
      paragraphs: [
        'Ein Administrator kann ein Konto deaktivieren, das diese Richtlinie nicht einhält. Die Organisation kann nach ihren eigenen Regeln weitere Maßnahmen ergreifen.',
      ],
    },
  ]

  const rules = textToParagraphs(c.usageRules)
  if (rules.length > 0) {
    sections.push({ id: 'additional', title: `Zusätzliche Regeln von ${orgName(c)}`, paragraphs: rules })
  }
  sections.push({ id: 'contact', title: 'Fragen', paragraphs: [contactLine(c)] })

  return {
    title: 'Nutzungsbedingungen',
    intro: `Diese Seite legt die Regeln für die Nutzung von ${c.siteName} fest. Sie wird aus der aktuellen Konfiguration dieser Installation erzeugt.`,
    sections,
  }
}
