import { useState, useEffect } from 'react';
import type { DraftPhoto, PointConfig, PublishPointPayload } from '@repo/shared-types';
import { publishCourse, updateCourse } from '../../services/api.js';

interface Props {
  draftPhotos: DraftPhoto[];
  pointConfigs: Record<string, PointConfig>;
  startPoint: { lat: number; lng: number } | null;
  onPublished: (courseId: string) => void;
  courseId?: string;        // if set → edit mode (PUT instead of POST)
  initialCourseName?: string;
}

export function PublishButton({ draftPhotos, pointConfigs, startPoint, onPublished, courseId, initialCourseName }: Props) {
  const isEditMode = !!courseId;
  const [courseName, setCourseName] = useState(initialCourseName ?? '');
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    if (initialCourseName) setCourseName(initialCourseName);
  }, [initialCourseName]);
  const [error, setError] = useState<string | null>(null);
  const [publishedCourseId, setPublishedCourseId] = useState<string | null>(null);

  function getIncompletePoints(): DraftPhoto[] {
    return draftPhotos.filter(photo => {
      if (!photo.hasGps) return false;
      const config = pointConfigs[photo.tempId] ?? null;
      return !config || config.pointOrder === null || config.teamAssignment === null;
    });
  }

  function buildPayload(): PublishPointPayload[] {
    return draftPhotos
      .filter(photo => photo.hasGps && photo.lat !== undefined && photo.lng !== undefined)
      .map(photo => {
        const config = pointConfigs[photo.tempId]!;
        let hintPhotoPath: string | null = null;
        if (config.hintPhotoSource === 'reference') {
          hintPhotoPath = photo.filename;
        } else if (config.hintPhotoSource === 'custom' && config.hintPhotoFilename) {
          hintPhotoPath = config.hintPhotoFilename;
        }
        return {
          referencePhotoPath: photo.filename,
          hintPhotoPath,
          hintText: config.hintText ?? null,
          pointOrder: config.pointOrder!,
          teamAssignment: config.teamAssignment!,
          lat: photo.lat!,
          lng: photo.lng!,
        };
      });
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
      const payload = { name: courseName.trim(), points: buildPayload(), startPoint };
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

  return (
    <div className="p-4 border border-gray-200 rounded-lg">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        {isEditMode ? 'Modifier le parcours' : 'Publier le parcours'}
      </h2>

      <input
        type="text"
        placeholder="Course name..."
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

      <button
        onClick={handlePublish}
        disabled={isPublishing || gpsPhotos.length === 0}
        className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
      >
        {isPublishing ? 'En cours…' : isEditMode ? 'Mettre à jour' : 'Publier'}
      </button>

      {error && (
        <p className="text-red-600 text-sm mt-2">{error}</p>
      )}
    </div>
  );
}
