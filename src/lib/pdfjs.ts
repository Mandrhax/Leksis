import 'server-only'
import path from 'node:path'

// Ouverture d'un PDF avec pdfjs-dist, commune à la lecture du texte (file-parser.ts) et à l'OCR des pages scannées
// (pdf-vision.ts). pdfjs a besoin de ses fichiers de données, qu'il faut lui indiquer explicitement sous Node :
//  - standard_fonts : les 14 polices standard (Helvetica, Times…), non incluses dans la plupart des PDF. Sans elles,
//    pdfjs se rabat sur le module canvas pour mesurer le texte — erreur dans le conteneur, plantage du processus sous
//    Windows : « File extraction failed » sur un PDF tout simple (1.11.0-beta.1) ;
//  - cmaps : encodages des polices CJK (chinois, japonais, coréen) ;
//  - wasm : décodeurs JBIG2 et JPEG 2000, très courants dans les PDF produits par un scanner ;
//  - iccs : profils de couleur.
// Le Dockerfile copie ces 4 dossiers à côté de pdf.mjs (node_modules/pdfjs-dist/ depuis le répertoire de l'app).

const PDFJS_DIR = path.join(process.cwd(), 'node_modules', 'pdfjs-dist')
// pdfjs exige une barre « / » finale (pas « \ », même sous Windows)
const dir = (name: string) => path.join(PDFJS_DIR, name).replace(/\\/g, '/') + '/'

export async function openPdf(buffer: Buffer, opts: { forRendering?: boolean } = {}) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as string) as typeof import('pdfjs-dist')
  return pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: dir('standard_fonts'),
    cMapUrl: dir('cmaps'),
    cMapPacked: true,
    wasmUrl: dir('wasm'),
    iccUrl: dir('iccs'),
    // Jamais de polices système ni de FontFace (pas de navigateur) ; la lecture du texte n'a pas besoin du canvas
    useSystemFonts: false,
    disableFontFace: true,
    isOffscreenCanvasSupported: opts.forRendering === true,
  })
}
