import exifr from 'exifr';
import { useState } from 'react';
import type { DraftPhoto, PhotoImportSummary } from '../types.js';

async function extractGps(file: File): Promise<{ lat: number; lng: number } | null> {
  try {
    const gps = await exifr.gps(file);
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      return { lat: gps.latitude, lng: gps.longitude };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Crée une URL de prévisualisation affichable dans tous les navigateurs.
 * Pour les fichiers HEIC/HEIF (iPhone), tente une conversion JPEG via Canvas.
 * Si le navigateur ne supporte pas HEIC (Chrome sur Windows/Android),
 * retourne quand même le blob URL d'origine — l'img onError prendra le relais.
 */
async function createPreviewUrl(file: File): Promise<string> {
  const isHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    (file.type === '' && /\.(heic|heif)$/i.test(file.name));

  if (isHeic) {
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      // Limiter la taille de la miniature pour éviter les problèmes mémoire
      const maxDim = 1200;
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      return await new Promise<string>((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('toBlob failed'))),
          'image/jpeg',
          0.88,
        );
      });
    } catch {
      // Le navigateur ne sait pas décoder HEIC (Chrome sur Windows/Android)
      // On retourne le blob URL d'origine ; l'img onError gère l'affichage
    }
  }
  return URL.createObjectURL(file);
}

interface UsePhotoImportResult {
  photos: DraftPhoto[];
  summary: PhotoImportSummary;
  isProcessing: boolean;
  processPhotos: (files: File[]) => Promise<DraftPhoto[]>;
  removePhoto: (tempId: string) => Promise<DraftPhoto | null>;
}

export function usePhotoImport(initialPhotos?: DraftPhoto[]): UsePhotoImportResult {
  const [photos, setPhotos] = useState<DraftPhoto[]>(initialPhotos ?? []);
  const [isProcessing, setIsProcessing] = useState(false);

  const summary: PhotoImportSummary = {
    total: photos.length,
    withGps: photos.filter((p) => p.hasGps).length,
    withoutGps: photos.filter((p) => !p.hasGps).length,
  };

  async function processPhotos(files: File[]): Promise<DraftPhoto[]> {
    if (files.length === 0) return [];
    setIsProcessing(true);

    try {
      // GPS extraction + preview URL creation en parallèle
      const [gpsResults, previewUrls] = await Promise.all([
        Promise.all(files.map(extractGps)),
        Promise.all(files.map(createPreviewUrl)),
      ]);

      const newPhotos: DraftPhoto[] = files.map((file, i) => {
        const gps = gpsResults[i] ?? null;
        return {
          tempId: crypto.randomUUID(),
          file,
          filename: file.name,
          originalName: file.name,
          previewUrl: previewUrls[i]!,
          hasGps: gps !== null,
          lat: gps?.lat,
          lng: gps?.lng,
          warning: gps === null ? `Pas de GPS dans ${file.name} (sur iPhone : Réglages → Confidentialité → Service de localisation → Appareil photo → Lors de l'utilisation)` : undefined,
        };
      });

      setPhotos((prev) => [...prev, ...newPhotos]);
      return newPhotos;
    } finally {
      setIsProcessing(false);
    }
  }

  async function removePhoto(tempId: string): Promise<DraftPhoto | null> {
    const photo = photos.find((p) => p.tempId === tempId);
    if (photo?.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(photo.previewUrl);
    }
    setPhotos(photos.filter((p) => p.tempId !== tempId));
    return photo ?? null;
  }

  return { photos, summary, isProcessing, processPhotos, removePhoto };
}
