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
  /** Processes files and returns the full updated photos array */
  processPhotos: (files: File[]) => Promise<DraftPhoto[]>;
  /** Removes a photo and returns the full updated photos array */
  removePhoto: (tempId: string) => Promise<DraftPhoto[]>;
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
    if (files.length === 0) return photos;
    setIsProcessing(true);

    try {
      // Extract GPS client-side in parallel (before upload for immediate feedback)
      const gpsResults = await Promise.all(files.map(extractGps));

      // Upload files to server
      const uploadResult = await uploadPhotos(files);
      const serverFiles = uploadResult.data.files;

      // Build DraftPhoto objects merging GPS + server data
      const newPhotos: DraftPhoto[] = files.map((file, i) => {
        const gps = gpsResults[i] ?? null;
        const serverFile = serverFiles[i];
        return {
          tempId: crypto.randomUUID(),
          filename: serverFile?.filename ?? '',
          originalName: file.name,
          serverPath: serverFile?.path ?? '',
          previewUrl: URL.createObjectURL(file),
          hasGps: gps !== null,
          lat: gps?.lat,
          lng: gps?.lng,
          warning: gps === null ? `Aucune donnée GPS dans ${file.name}` : undefined,
        };
      });

      setPhotos((prev) => [...prev, ...newPhotos]);
      // Return the merged array using current snapshot + newPhotos
      return [...photos, ...newPhotos];
    } finally {
      setIsProcessing(false);
    }
  }

  async function removePhoto(tempId: string): Promise<DraftPhoto[]> {
    const photo = photos.find((p) => p.tempId === tempId);

    if (photo) {
      if (photo.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(photo.previewUrl);
        // Only delete from server if this was a newly uploaded file (blob URL = just uploaded)
        if (photo.filename) {
          try {
            await deleteUpload(photo.filename);
          } catch {
            // Non-blocking: proceed with local removal even if server fails
          }
        }
      }
    }

    const updated = photos.filter((p) => p.tempId !== tempId);
    setPhotos(updated);
    return updated;
  }

  return { photos, summary, isProcessing, processPhotos, removePhoto };
}
