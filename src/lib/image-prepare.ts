// Préparation d'une image dans le navigateur avant envoi (retours des utilisateurs, OCR). Navigateur uniquement.

/**
 * Redessine l'image dans un canvas : applique l'orientation EXIF, réduit les très grandes images (côté le plus long
 * ≤ `maxSide`) et retire toutes les métadonnées (position GPS d'une photo prise au téléphone…). PNG reste PNG
 * (captures d'écran : texte net), le reste devient JPEG. Le serveur revérifie de toute façon format et taille.
 * 'format' : le navigateur ne sait pas lire l'image ; 'too_large' : encore au-dessus de `maxBytes` après réduction.
 */
export async function prepareImage(
  file: Blob,
  { maxSide, maxBytes = Number.POSITIVE_INFINITY }: { maxSide: number; maxBytes?: number },
): Promise<Blob | 'format' | 'too_large'> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return 'format'
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return 'format'
  ctx.fillStyle = '#ffffff' // fond blanc : la transparence devient noire en JPEG
  if (file.type !== 'image/png') ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const encode = (type: string, quality?: number) =>
    new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality))
  let out = await encode(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9)
  if (out && out.size > maxBytes) out = await encode('image/jpeg', 0.85)
  if (!out) return 'format'
  return out.size > maxBytes ? 'too_large' : out
}

/** Côté le plus long d'une image envoyée à l'OCR : assez pour lire un texte serré, sans payer des mégapixels inutiles. */
export const OCR_IMAGE_MAX_SIDE = 2400

/**
 * Image à envoyer à l'OCR : réduite quand elle dépasse OCR_IMAGE_MAX_SIDE (photo de 12 Mpx d'un téléphone),
 * sinon l'originale. En cas d'échec (format que le navigateur ne lit pas), l'originale : le serveur décidera.
 */
export async function prepareOcrImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const big = Math.max(bitmap.width, bitmap.height) > OCR_IMAGE_MAX_SIDE
    bitmap.close()
    if (!big) return file
    const out = await prepareImage(file, { maxSide: OCR_IMAGE_MAX_SIDE })
    return out instanceof Blob && out.size < file.size ? out : file
  } catch {
    return file
  }
}
