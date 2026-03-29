import { useState, useEffect } from 'react';
import imageCompression from 'browser-image-compression';
import type { DraftPhoto, PointConfig, PublishPointPayload } from '../../types.js';
import { publishCourse, updateCourse, saveDraft, updateDraft, uploadPhotos } from '../../services/api.js';

interface Props {
  draftPhotos: DraftPhoto[];
  pointConfigs: Record<string, PointConfig>;
  startPoint: { lat: number; lng: number } | null;
  onPublished: (courseId: string) => void;
  courseId?: string;        // if set → edit mode (PUT instead of POST)
  initialCourseName?: string;
  isDraft?: boolean;        // true si la course existante est un brouillon
}

export function PublishButton({ draftPhotos, pointConfigs, startPoint, onPublished, courseId, initialCourseName, isDraft }: Props) {
  const isEditMode = !!courseId;
  const showDraftButton = !isEditMode || isDraft === true;
  const [courseName, setCourseName] = useState(initialCourseName ?? '');
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  useEffect(() => {
    if (initialCourseName) setCourseName(initialCourseName);
  }, [initialCourseName]);
  const [error, setError] = useState<string | null>(null);
  const [publishedCourseId, setPublishedCourseId] = useState<string | null>(null);

  async function compressHintPhoto(file: File): Promise<File> {
    const options = {
      maxSizeMB: 0.5, // Smaller size for hint photos
      maxWidthOrHeight: 1280,
      useWebWorker: true,
      fileType: 'image/webp' as const,
    };

    try {
      const compressedFile = await imageCompression(file, options);
      return new File([compressedFile], file.name.replace(/\.[^.]+$/, '.webp'), {
        type: 'image/webp',
        lastModified: Date.now(),
      });
    } catch (error) {
      console.warn('Hint photo compression failed, using original file:', error);
      return file;
    }
  }

  async function compressReferencePhoto(file: File): Promise<File> {
    const options = {
      maxSizeMB: 0.8, // Maximum size in MB for reference photos
      maxWidthOrHeight: 1600, // Maximum width or height
      useWebWorker: true,
      fileType: 'image/webp' as const,
    };

    try {
      const compressedFile = await imageCompression(file, options);
      return new File([compressedFile], file.name.replace(/\.[^.]+$/, '.webp'), {
        type: 'image/webp',
        lastModified: Date.now(),
      });
    } catch (error) {
      console.warn('Reference photo compression failed, using original file:', error);
      return file;
    }
  }

  function getIncompletePoints(): DraftPhoto[] {
    return draftPhotos.filter(photo => {
      if (!photo.hasGps) return false;
      const config = pointConfigs[photo.tempId] ?? null;
      return !config || config.pointOrder === null || config.teamAssignment === null;
    });
  }

  function buildPayload(uploadedFiles: { filename: string; tempId: string; type: 'reference' | 'hint' }[]): PublishPointPayload[] {
    return draftPhotos
      .filter(photo => photo.hasGps && photo.lat !== undefined && photo.lng !== undefined)
      .map(photo => {
        const config = pointConfigs[photo.tempId]!;
        // Find the uploaded filename for this photo, or use existing filename
        const referenceUpload = uploadedFiles.find(f => f.tempId === photo.tempId && f.type === 'reference');
        const referencePhotoPath = referenceUpload?.filename ?? photo.filename;

        let hintPhotoPath: string | null = null;
        if (config.hintPhotoSource === 'reference') {
          hintPhotoPath = referencePhotoPath;
        } else if (config.hintPhotoSource === 'custom') {
          // Find the uploaded hint photo filename, or use existing filename
          const hintUpload = uploadedFiles.find(f => f.tempId === photo.tempId && f.type === 'hint');
          hintPhotoPath = hintUpload?.filename ?? config.hintPhotoFilename ?? null;
        }

        return {
          referencePhotoPath,
          hintPhotoPath,
          hintText: config.hintText ?? null,
          pointOrder: config.pointOrder!,
          teamAssignment: config.teamAssignment!,
          lat: photo.lat!,
          lng: photo.lng!,
        };
      });
  }

  function buildDraftPayload(uploadedFiles: { filename: string; tempId: string; type: 'reference' | 'hint' }[]): PublishPointPayload[] {
    return draftPhotos
      .filter(photo => photo.hasGps && photo.lat !== undefined && photo.lng !== undefined)
      .map((photo, index) => {
        const config = pointConfigs[photo.tempId] ?? null;
        const referenceUpload = uploadedFiles.find(f => f.tempId === photo.tempId && f.type === 'reference');
        const referencePhotoPath = referenceUpload?.filename ?? photo.filename;

        let hintPhotoPath: string | null = null;
        if (config?.hintPhotoSource === 'reference') {
          hintPhotoPath = referencePhotoPath;
        } else if (config?.hintPhotoSource === 'custom') {
          const hintUpload = uploadedFiles.find(f => f.tempId === photo.tempId && f.type === 'hint');
          hintPhotoPath = hintUpload?.filename ?? config.hintPhotoFilename ?? null;
        }

        return {
          referencePhotoPath,
          hintPhotoPath,
          hintText: config?.hintText ?? null,
          pointOrder: config?.pointOrder ?? index + 1,
          teamAssignment: config?.teamAssignment ?? 'both',
          lat: photo.lat!,
          lng: photo.lng!,
        };
      });
  }

  async function handleSaveDraft(): Promise<void> {
    if (!courseName.trim()) {
      setError('Veuillez saisir un nom de parcours');
      return;
    }
    setError(null);
    setIsSavingDraft(true);
    try {
      const filesToUpload: File[] = [];
      const fileMappings: { tempId: string; type: 'reference' | 'hint'; originalIndex: number }[] = [];

      draftPhotos
        .filter(photo => photo.hasGps && photo.file)
        .forEach((photo, index) => {
          filesToUpload.push(photo.file!);
          fileMappings.push({ tempId: photo.tempId, type: 'reference', originalIndex: index });
        });

      Object.entries(pointConfigs).forEach(([tempId, config]) => {
        if (config.hintPhotoSource === 'custom' && config.hintPhotoFile) {
          filesToUpload.push(config.hintPhotoFile);
          fileMappings.push({ tempId, type: 'hint', originalIndex: filesToUpload.length - 1 });
        }
      });

      let uploadedFiles: { filename: string; tempId: string; type: 'reference' | 'hint' }[] = [];

      if (filesToUpload.length > 0) {
        const processedFiles = await Promise.all(
          filesToUpload.map(async (file, index) => {
            const mapping = fileMappings[index];
            if (mapping?.type === 'hint') return await compressHintPhoto(file);
            return await compressReferencePhoto(file);
          })
        );
        const uploadResult = await uploadPhotos(processedFiles);
        uploadedFiles = uploadResult.data.files.map((uploadedFile: any, index: number) => ({
          filename: uploadedFile.filename,
          tempId: fileMappings[index]?.tempId || '',
          type: fileMappings[index]?.type || 'reference',
        }));
      }

      const payload = {
        name: courseName.trim(),
        points: buildDraftPayload(uploadedFiles),
        startPoint: startPoint ?? null,
      };

      const response = isEditMode
        ? await updateDraft(courseId, payload)
        : await saveDraft(payload);
      onPublished(response.data.courseId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de sauvegarde');
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function handlePublish(): Promise<void> {
    const incomplete = getIncompletePoints();
    if (incomplete.length > 0) {
      setError(`${incomplete.length} point(s) manquent un numéro ou une équipe`);
      return;
    }
    if (!startPoint) {
      setError('Un point de départ est requis');
      return;
    }
    if (!courseName.trim()) {
      setError('Veuillez saisir un nom de parcours');
      return;
    }
    setError(null);
    setIsPublishing(true);
    try {
      // Collect all files to upload: reference photos + hint photos
      const filesToUpload: File[] = [];
      const fileMappings: { tempId: string; type: 'reference' | 'hint'; originalIndex: number }[] = [];

      // Add reference photos
      draftPhotos
        .filter(photo => photo.hasGps && photo.file)
        .forEach((photo, index) => {
          filesToUpload.push(photo.file!);
          fileMappings.push({ tempId: photo.tempId, type: 'reference', originalIndex: index });
        });

      // Add hint photos
      Object.entries(pointConfigs).forEach(([tempId, config]) => {
        if (config.hintPhotoSource === 'custom' && config.hintPhotoFile) {
          filesToUpload.push(config.hintPhotoFile);
          fileMappings.push({ tempId, type: 'hint', originalIndex: filesToUpload.length - 1 });
        }
      });

      let uploadedFiles: { filename: string; tempId: string; type: 'reference' | 'hint' }[] = [];

      if (filesToUpload.length > 0) {
        // Compress all photos before uploading
        const processedFiles = await Promise.all(
          filesToUpload.map(async (file, index) => {
            const mapping = fileMappings[index];
            if (mapping && mapping.type === 'hint') {
              return await compressHintPhoto(file);
            } else if (mapping && mapping.type === 'reference') {
              return await compressReferencePhoto(file);
            }
            return file;
          })
        );

        const uploadResult = await uploadPhotos(processedFiles);
        uploadedFiles = uploadResult.data.files.map((uploadedFile: any, index: number) => ({
          filename: uploadedFile.filename,
          tempId: fileMappings[index]?.tempId || '',
          type: fileMappings[index]?.type || 'reference',
        }));
      }

      // Build payload with uploaded filenames
      const payload = {
        name: courseName.trim(),
        points: buildPayload(uploadedFiles),
        startPoint
      };

      const response = isEditMode
        ? await updateCourse(courseId, payload)
        : await publishCourse(payload);
      setPublishedCourseId(response.data.courseId);
      onPublished(response.data.courseId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Publication failed');
    } finally {
      setIsPublishing(false);
    }
  }

  const gpsPhotos = draftPhotos.filter(p => p.hasGps);
  const incompletePoints = getIncompletePoints();

  if (publishedCourseId) {
    return (
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
        <p className="text-green-800 font-medium">Course published successfully!</p>
        <p className="text-green-600 text-sm mt-1">Course ID: {publishedCourseId}</p>
      </div>
    );
  }

  const isBusy = isPublishing || isSavingDraft;

  return (
    <div className="p-4 border border-gray-200 rounded-lg">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        {isEditMode ? 'Modifier le parcours' : 'Publier le parcours'}
      </h2>

      <input
        type="text"
        placeholder="Nom du parcours..."
        value={courseName}
        onChange={e => setCourseName(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-3"
      />

      {!startPoint && (
        <p className="text-amber-600 text-sm mb-3">
          ⚠️ Aucun point de départ — cliquez "Placer le départ" au-dessus de la carte
        </p>
      )}

      {incompletePoints.length > 0 && (
        <p className="text-amber-600 text-sm mb-3">
          ⚠️ {incompletePoints.length} point(s) manquent un numéro ou une équipe
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {showDraftButton && (
          <button
            onClick={() => void handleSaveDraft()}
            disabled={isBusy || gpsPhotos.length === 0}
            className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200"
          >
            {isSavingDraft ? 'Sauvegarde…' : 'Sauvegarder brouillon'}
          </button>
        )}

        <button
          onClick={() => void handlePublish()}
          disabled={isBusy || gpsPhotos.length === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
        >
          {isPublishing ? 'Publication…' : isEditMode ? 'Mettre à jour' : 'Publier'}
        </button>
      </div>

      {error && (
        <p className="text-red-600 text-sm mt-2">{error}</p>
      )}
    </div>
  );
}
