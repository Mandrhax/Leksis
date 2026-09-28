import { DOCUMENT_MAX_BYTES, OCR_MAX_PDF_PAGES } from '@/lib/validators'
import { textToParagraphs, type LegalContext, type LegalDocument, type LegalSection } from '@/lib/legal-content'

const fmt = (n: number) => n.toLocaleString('it-IT')

function retention(days: number, what: string): string {
  return days > 0
    ? `${what} vengono eliminate automaticamente dopo ${fmt(days)} ${days === 1 ? 'giorno' : 'giorni'}.`
    : `${what} vengono conservate finché un amministratore non le elimina.`
}

function orgName(c: LegalContext): string {
  return c.organization || 'l’organizzazione che gestisce questo servizio'
}

function contactLine(c: LegalContext): string {
  return c.contact
    ? `Per qualsiasi domanda su questa informativa o sui vostri dati, contattate ${c.contact}.`
    : 'Per qualsiasi domanda su questa informativa o sui vostri dati, contattate il vostro amministratore.'
}

function enabledFeatureNames(c: LegalContext): string[] {
  return [
    c.features.text     && 'la traduzione di testo',
    c.features.document && 'la traduzione di documenti (PDF, DOCX, TXT, CSV)',
    c.features.image    && 'l’estrazione di testo da immagini (OCR)',
    c.features.rewrite  && 'la riscrittura e la correzione assistite dall’IA',
  ].filter((x): x is string => Boolean(x))
}

function aiDestination(c: LegalContext): LegalSection {
  const always = `Il vostro browser non contatta mai direttamente il modello di IA: ogni richiesta passa dal server ${c.siteName}, che la inoltra al modello.`
  if (c.aiScope === 'external') {
    return {
      id: 'ai-processing',
      title: 'Dove viene elaborato il vostro contenuto',
      warning: true,
      paragraphs: [
        `Il modello di IA utilizzato da ${c.siteName} è un servizio esterno, situato al di fuori della rete privata di ${orgName(c)}. Il testo, i documenti e le immagini che inviate vengono trasmessi a questo servizio per essere elaborati e lasciano l’infrastruttura dell’organizzazione.`,
        'Questo fornitore elabora i contenuti secondo le proprie condizioni. Chiedete al contatto indicato di seguito quale fornitore viene utilizzato e come tratta i dati (conservazione, addestramento, ubicazione) prima di inviare contenuti sensibili.',
        always,
      ],
    }
  }
  return {
    id: 'ai-processing',
    title: 'Dove viene elaborato il vostro contenuto',
    paragraphs: [
      c.aiScope === 'local'
        ? `Il modello di IA funziona sullo stesso server di ${c.siteName}. Il testo, i documenti e le immagini che inviate vengono elaborati lì e non lasciano mai l’infrastruttura di ${orgName(c)}.`
        : `Il modello di IA funziona su un server all’interno della rete privata di ${orgName(c)}. Il testo, i documenti e le immagini che inviate restano in questa rete e non vengono inviati ad alcun servizio esterno.`,
      always,
    ],
  }
}

export function buildPrivacyPolicy(c: LegalContext): LegalDocument {
  const sections: LegalSection[] = [
    {
      id: 'controller',
      title: 'Chi è responsabile dei vostri dati',
      paragraphs: [
        `${c.siteName} è uno strumento di traduzione e riscrittura installato e gestito da ${orgName(c)} sulla propria infrastruttura. Questa organizzazione decide perché e come vengono trattati i vostri dati e ne è responsabile.`,
        `L’editore del software ${c.siteName} non ha accesso ai vostri dati. Il software non invia dati di utilizzo, statistiche o telemetria al proprio editore né a terzi.`,
        contactLine(c),
      ],
    },
    {
      id: 'data',
      title: 'Cosa viene trattato',
      items: [
        'Account: il vostro indirizzo e-mail, il vostro nome se fornito, il vostro ruolo, se l’account è attivo e la data di creazione.',
        'Accesso: un codice monouso, valido 10 minuti, e una sessione che mantiene l’accesso attivo.',
        'Contenuto che inviate: il testo, i documenti e le immagini che traducete, estraete o riscrivete. Vengono elaborati in memoria per produrre il risultato e non sono conservati dall’applicazione una volta completata la richiesta.',
        'Registro di utilizzo: per ogni richiesta IA, la data, il vostro indirizzo e-mail, la funzione utilizzata, le lingue, il modello e il numero di caratteri. Il contenuto in sé non viene mai registrato.',
        'Registro di audit: per gli amministratori, una registrazione delle azioni amministrative con l’indirizzo e-mail dell’amministratore.',
        'Glossari: i termini definiti dagli amministratori e la vostra scelta su quali glossari disattivare.',
      ],
    },
    aiDestination(c),
    {
      id: 'cookies',
      title: 'Cookie e memorizzazione nel browser',
      paragraphs: [
        'L’applicazione utilizza un numero limitato di cookie tecnici per mantenere l’accesso attivo e proteggere l’accesso da richieste falsificate. Sono strettamente necessari e non vengono utilizzati per il tracciamento.',
        'Il vostro browser memorizza anche le vostre preferenze localmente: lingua dell’interfaccia, lingue preferite e ultima lingua di destinazione scelta in ciascuno strumento. Queste informazioni restano sul vostro dispositivo e non vengono mai inviate al server.',
        'Non sono presenti cookie pubblicitari o statistici, e il vostro browser non carica risorse di terzi (font, script, tracker).',
      ],
    },
    {
      id: 'retention',
      title: 'Per quanto tempo i dati vengono conservati',
      items: [
        retention(c.usageRetentionDays, 'Le voci del registro di utilizzo'),
        retention(c.auditRetentionDays, 'Le voci del registro di audit'),
        'I codici di accesso scadono dopo 10 minuti.',
        'Gli account vengono conservati finché un amministratore non li elimina.',
        'Il contenuto inviato non viene conservato (vedi sopra).',
      ],
    },
    {
      id: 'security',
      title: 'Come i dati vengono protetti',
      items: [
        'L’accesso richiede l’autenticazione con un codice monouso, e gli amministratori possono disattivare un account in qualsiasi momento.',
        'Le pagine di amministrazione sono riservate agli amministratori, e le azioni amministrative vengono registrate.',
        'I segreti memorizzati, come una chiave API per il servizio IA, sono cifrati e non vengono mai mostrati nell’interfaccia né esportati.',
        ...(c.limits.rateLimitPerMin > 0 ? ['Le richieste IA sono soggette a un limite di frequenza per utente.'] : []),
        'Le connessioni sono cifrate con HTTPS quando l’amministratore lo ha attivato.',
      ],
    },
    {
      id: 'rights',
      title: 'I vostri diritti',
      paragraphs: [
        'In base al diritto sulla protezione dei dati (come il RGPD nell’Unione europea e la legge federale sulla protezione dei dati rivista in Svizzera), potete chiedere l’accesso ai vostri dati, la loro rettifica o cancellazione, la limitazione o l’opposizione al loro trattamento, e riceverne una copia. L’organizzazione che gestisce questo servizio determina la base giuridica del trattamento.',
        'Gli account vengono creati al primo accesso. L’eliminazione di un account non impedisce quindi di per sé alla persona di accedere nuovamente: per bloccare l’accesso, un amministratore disattiva l’account.',
        `${contactLine(c)} Potete inoltre presentare reclamo all’autorità competente in materia di protezione dei dati, ad esempio l’Incaricato federale della protezione dei dati e della trasparenza (IFPDT) in Svizzera o la vostra autorità nazionale nell’Unione europea.`,
      ],
    },
  ]

  const notes = textToParagraphs(c.privacyNotes)
  if (notes.length > 0) {
    sections.push({ id: 'additional', title: `Informazioni aggiuntive da ${orgName(c)}`, paragraphs: notes })
  }

  return {
    title: 'Informativa sulla privacy',
    intro: `Questa pagina descrive come ${c.siteName} tratta i dati personali. È generata a partire dalla configurazione attuale di questa installazione.`,
    sections,
  }
}

export function buildUsagePolicy(c: LegalContext): LegalDocument {
  const features = enabledFeatureNames(c)
  const l = c.limits

  const sensitive: LegalSection = c.aiScope === 'external'
    ? {
        id: 'confidentiality',
        title: 'Dati riservati e personali',
        warning: true,
        paragraphs: [
          `Il contenuto inviato a ${c.siteName} viene trasmesso a un servizio di IA esterno, situato al di fuori della rete privata di ${orgName(c)}. Non inviate nulla che non siate autorizzati a condividere al di fuori dell’organizzazione, come dati riservati, protetti, classificati o categorie particolari di dati personali, salvo approvazione esplicita dell’organizzazione.`,
        ],
      }
    : {
        id: 'confidentiality',
        title: 'Dati riservati e personali',
        paragraphs: [
          `Il contenuto inviato a ${c.siteName} resta all’interno dell’infrastruttura di ${orgName(c)}. Dovete comunque rispettare le regole dell’organizzazione in materia di classificazione dei dati e inviare dati personali su altre persone solo quando necessario per il vostro lavoro.`,
        ],
      }

  const sections: LegalSection[] = [
    {
      id: 'purpose',
      title: 'Finalità',
      paragraphs: [
        `${c.siteName} è messo a disposizione da ${orgName(c)} ai propri utenti autorizzati per finalità professionali.`,
        features.length > 0
          ? `Offre: ${features.join('; ')}.`
          : 'Al momento non è attiva alcuna funzione.',
        'Accedendo, accettate di rispettare questa informativa.',
      ],
    },
    {
      id: 'acceptable',
      title: 'Uso consentito',
      items: [
        'Utilizzare il servizio per finalità professionali legittime.',
        'Inviare solo contenuti che siete autorizzati a trattare.',
        'Mantenere il vostro account personale e non condividere i vostri codici di accesso.',
        'Verificare i risultati prima di farvi affidamento o di inviarli a qualcuno.',
      ],
    },
    {
      id: 'prohibited',
      title: 'Ciò che non è consentito',
      items: [
        'Inviare o produrre contenuti illeciti, o contenuti che molestano, minacciano o discriminano altre persone.',
        'Trattare contenuti che violano il diritto d’autore o altri diritti di terzi.',
        'Utilizzare i risultati per ingannare o fuorviare le persone.',
        'Tentare di aggirare l’accesso, i limiti di utilizzo o altre misure di sicurezza, o di accedere all’account di un’altra persona.',
        'Sovraccaricare il servizio, ad esempio con richieste automatizzate o massive al di fuori dell’interfaccia normale.',
        'Tentare di far ignorare al modello di IA le proprie istruzioni o di farlo rivelarle.',
      ],
    },
    sensitive,
    {
      id: 'ai-limits',
      title: 'Limiti dei risultati dell’IA',
      paragraphs: [
        'Le traduzioni, il testo estratto e il testo riscritto sono prodotti da un modello di IA. Possono contenere errori, omissioni, contenuti inventati o cambiamenti di significato, e il testo riconosciuto da immagini o documenti scansionati può essere letto in modo errato.',
        'Rimanete responsabili dell’uso che fate dei risultati. Non si tratta di traduzioni certificate e dovrebbero essere riviste da una persona qualificata per contenuti legali, medici, finanziari o critici per la sicurezza.',
      ],
    },
    {
      id: 'limits',
      title: 'Limiti di utilizzo',
      items: [
        ...(c.features.text || c.features.rewrite ? [`Testo: fino a ${fmt(l.maxTextChars)} caratteri per richiesta.`] : []),
        ...(c.features.document
          ? [`Documenti: file fino a ${DOCUMENT_MAX_BYTES / (1024 * 1024)} MB e ${fmt(l.maxDocChars)} caratteri di testo; i PDF scansionati vengono letti fino a ${OCR_MAX_PDF_PAGES} pagine.`]
          : []),
        ...(c.features.image ? [`Immagini: fino a ${l.maxImageMB} MB per immagine.`] : []),
        l.rateLimitPerMin > 0
          ? `Richieste: fino a ${fmt(l.rateLimitPerMin)} richieste IA al minuto per utente.`
          : 'Richieste: non è impostato alcun limite al minuto.',
      ],
    },
    {
      id: 'monitoring',
      title: 'Monitoraggio',
      paragraphs: [
        'Il vostro utilizzo del servizio viene registrato: chi ha usato quale funzione, quando, in quali lingue e per quanti caratteri. Il contenuto che inviate non viene registrato. Gli amministratori possono consultare questi registri. Per maggiori dettagli, vedere l’informativa sulla privacy.',
      ],
    },
    {
      id: 'enforcement',
      title: 'Conseguenze',
      paragraphs: [
        'Un amministratore può disattivare un account che non rispetta questa informativa. L’organizzazione può adottare ulteriori misure secondo le proprie regole.',
      ],
    },
  ]

  const rules = textToParagraphs(c.usageRules)
  if (rules.length > 0) {
    sections.push({ id: 'additional', title: `Regole aggiuntive da ${orgName(c)}`, paragraphs: rules })
  }
  sections.push({ id: 'contact', title: 'Domande', paragraphs: [contactLine(c)] })

  return {
    title: 'Condizioni d’uso',
    intro: `Questa pagina stabilisce le regole per l’utilizzo di ${c.siteName}. È generata a partire dalla configurazione attuale di questa installazione.`,
    sections,
  }
}
