import exifr from 'exifr';
import { useState } from 'react';
import { deleteUpload, uploadPhotos } from '../services/api.js';
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

interface UsePhotoImportResult {
  photos: DraftPhoto[];
  summary: PhotoImportSummary;
  isProcessing: boolean;
  /** Processes files and returns the new photos only */
  processPhotos: (files: File[]) => Promise<DraftPhoto[]>;
  /** Removes a photo and returns the removed photo */
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
      // Extract GPS client-side in parallel (before upload for immediate feedback)
      const gpsResults = await Promise.all(files.map(extractGps));

      // Build DraftPhoto objects with local files (no server upload yet, no compression yet)
      const newPhotos: DraftPhoto[] = files.map((file, i) => {
        const gps = gpsResults[i] ?? null;
        return {
          tempId: crypto.randomUUID(),
          file,
          filename: file.name, // Will be set properly during publish
          originalName: file.name,
          previewUrl: URL.createObjectURL(file),
          hasGps: gps !== null,
          lat: gps?.lat,
          lng: gps?.lng,
          warning: gps === null ? `Pas de GPS dans ${file.name} (sur iPhone : Réglages → Confidentialité → Service de localisation → Appareil photo → Lors de l'utilisation)` : undefined,
        };
      });

      setPhotos((prev) => [...prev, ...newPhotos]);
      // Return only the new photos
      return newPhotos;
    } finally {
      setIsProcessing(false);
    }
  }

  async function removePhoto(tempId: string): Promise<DraftPhoto | null> {
    const photo = photos.find((p) => p.tempId === tempId);

    if (photo) {
      if (photo.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(photo.previewUrl);
        // No server deletion needed for local photos - they haven't been uploaded yet
      } else {
        // For photos loaded from existing courses, we might need to handle deletion differently
        // but for now, just revoke the object URL if it exists
        if (photo.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(photo.previewUrl);
        }
      }
    }

    const updated = photos.filter((p) => p.tempId !== tempId);
    setPhotos(updated);
    return photo || null; // Return the removed photo
  }

  return { photos, summary, isProcessing, processPhotos, removePhoto };
}
