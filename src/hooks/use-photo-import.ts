import exifr from 'exifr';
import heic2any from 'heic2any';
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

function isHeicFile(file: File): boolean {
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    ((file.type === '' || file.type === 'application/octet-stream') &&
      /\.(heic|heif)$/i.test(file.name))
  );
}

/**
 * Convertit un fichier HEIC/HEIF en JPEG (fichier + prévisualisation).
 * Retourne le fichier JPEG converti et son URL de prévisualisation.
 */
async function convertHeicToJpeg(file: File): Promise<{ file: File; previewUrl: string }> {
  // 1er essai : Canvas (Safari/iOS supporte HEIC nativement, très rapide)
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const maxDim = 1200;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        'image/jpeg',
        0.88,
      );
    });
    const jpegName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return { file: new File([blob], jpegName, { type: 'image/jpeg' }), previewUrl: URL.createObjectURL(blob) };
  } catch {
    // Canvas ne supporte pas HEIC (Chrome, Firefox) — décodeur WASM
  }

  // 2e essai : heic2any (fonctionne dans tous les navigateurs)
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.88 });
  const blob = Array.isArray(result) ? result[0]! : result;
  const jpegName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
  return { file: new File([blob], jpegName, { type: 'image/jpeg' }), previewUrl: URL.createObjectURL(blob) };
}

async function prepareFile(file: File): Promise<{ file: File; previewUrl: string }> {
  if (isHeicFile(file)) {
    return convertHeicToJpeg(file);
  }
  return { file, previewUrl: URL.createObjectURL(file) };
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
      const [gpsResults, prepared] = await Promise.all([
        Promise.all(files.map(extractGps)),
        Promise.all(files.map(prepareFile)),
      ]);

      const newPhotos: DraftPhoto[] = files.map((file, i) => {
        const gps = gpsResults[i] ?? null;
        const { file: preparedFile, previewUrl } = prepared[i]!;
        return {
          tempId: crypto.randomUUID(),
          file: preparedFile,
          filename: preparedFile.name,
          originalName: file.name,
          previewUrl,
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
