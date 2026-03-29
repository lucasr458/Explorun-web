import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { DraftPhoto, PointConfig } from '../types.js';
import { PhotoImporter } from '../components/photo-importer/photo-importer.js';
import { CourseMapEditor } from '../components/course-map-editor/course-map-editor.js';
import { PointEditor } from '../components/point-editor/point-editor.js';
import { PublishButton } from '../components/publish-button/publish-button.js';
import { deleteUpload, getCourse, getApiUrl } from '../services/api.js';

export function CourseEditorPage() {
  const navigate = useNavigate();
  const { courseId } = useParams<{ courseId?: string }>();
  const isEditMode = !!courseId;

  const [draftPhotos, setDraftPhotos] = useState<DraftPhoto[]>([]);
  const [pointConfigs, setPointConfigs] = useState<Record<string, PointConfig>>({});
  const [selectedTempId, setSelectedTempId] = useState<string | null>(null);
  const [placingPhotoId, setPlacingPhotoId] = useState<string | null>(null);
  const [placingStartPoint, setPlacingStartPoint] = useState(false);
  const [startPoint, setStartPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [positionHistory, setPositionHistory] = useState<Array<{ tempId: string; lat?: number; lng?: number; hasGps: boolean; warning?: string }[]>>([]);
  const [initialPhotos, setInitialPhotos] = useState<DraftPhoto[] | undefined>(undefined);
  const [initialCourseName, setInitialCourseName] = useState<string | undefined>(undefined);
  const [isExistingDraft, setIsExistingDraft] = useState<boolean | undefined>(undefined);
  const [loadingCourse, setLoadingCourse] = useState(isEditMode);

  useEffect(() => {
    if (!courseId) return;
    getCourse(courseId).then(res => {
      const { course, points: coursePoints } = res.data;
      setInitialCourseName(course.name);
      setIsExistingDraft(!course.published);

      const photos: DraftPhoto[] = [];
      const configs: Record<string, PointConfig> = {};

      for (const point of coursePoints) {
        // Use the DB id as tempId — stable across re-renders and StrictMode double-invocation
        const tempId = point.id;
        photos.push({
          tempId,
          filename: point.referencePhotoPath,
          originalName: point.referencePhotoPath,
          previewUrl: `${getApiUrl()}/uploads/${point.referencePhotoPath}`,
          hasGps: true,
          lat: point.lat,
          lng: point.lng,
        });
        let hintPhotoSource: 'reference' | 'custom' | null = null;
        let hintPhotoFilename: string | null = null;
        if (point.hintPhotoPath !== null) {
          if (point.hintPhotoPath === point.referencePhotoPath) {
            hintPhotoSource = 'reference';
          } else {
            hintPhotoSource = 'custom';
            hintPhotoFilename = point.hintPhotoPath;
          }
        }
        configs[tempId] = {
          pointOrder: point.pointOrder,
          teamAssignment: point.teamAssignment,
          hintText: point.hintText,
          hintPhotoSource,
          hintPhotoFilename,
        };
      }

      // Set draftPhotos and pointConfigs together so tempIds always match
      setDraftPhotos(photos);
      setInitialPhotos(photos);
      setPointConfigs(configs);
      if (course.startLat != null && course.startLng != null) {
        setStartPoint({ lat: course.startLat, lng: course.startLng });
      }
      setLoadingCourse(false);
    }).catch(() => setLoadingCourse(false));
  }, [courseId]);

  function handlePhotosImported(newPhotos: DraftPhoto[]) {
    setDraftPhotos(prev => [...prev, ...newPhotos]);
  }

  function handlePhotoRemoved(tempId: string) {
    setDraftPhotos(prev => prev.filter(p => p.tempId !== tempId));
  }

  async function handleRemovePhoto(tempId: string): Promise<void> {
    const photo = draftPhotos.find(p => p.tempId === tempId);
    if (!photo) return;
    // Photos are now kept local until publishing, so no server deletion needed
    // Just revoke the blob URL
    if (photo.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(photo.previewUrl);
    }
    setDraftPhotos(prev => prev.filter(p => p.tempId !== tempId));
    if (selectedTempId === tempId) setSelectedTempId(null);
  }

  function handleConfigChange(tempId: string, config: PointConfig): void {
    setPointConfigs(prev => ({ ...prev, [tempId]: config }));
  }

  function handleSelectPoint(tempId: string): void {
    setSelectedTempId(tempId);
  }

  function snapshotPositions(): { tempId: string; lat?: number; lng?: number; hasGps: boolean; warning?: string }[] {
    return draftPhotos.map(p => ({ tempId: p.tempId, lat: p.lat, lng: p.lng, hasGps: p.hasGps, warning: p.warning }));
  }

  function handleMapClick(lat: number, lng: number): void {
    if (placingStartPoint) {
      setStartPoint({ lat, lng });
      setPlacingStartPoint(false);
      return;
    }
    if (!placingPhotoId) return;
    setPositionHistory(prev => [...prev.slice(-49), snapshotPositions()]);
    setDraftPhotos(prev => prev.map(p =>
      p.tempId === placingPhotoId
        ? { ...p, lat, lng, hasGps: true, warning: undefined }
        : p,
    ));
    setPlacingPhotoId(null);
  }

  function handleStartPointDragEnd(lat: number, lng: number): void {
    setStartPoint({ lat, lng });
  }

  function handleMarkerDragEnd(tempId: string, lat: number, lng: number): void {
    setPositionHistory(prev => [...prev.slice(-49), snapshotPositions()]);
    setDraftPhotos(prev => prev.map(p =>
      p.tempId === tempId ? { ...p, lat, lng } : p,
    ));
  }

  function handleUndo(): void {
    if (positionHistory.length === 0) return;
    const last = positionHistory[positionHistory.length - 1]!;
    setPositionHistory(prev => prev.slice(0, -1));
    setDraftPhotos(prev => prev.map(p => {
      const saved = last.find(s => s.tempId === p.tempId);
      if (!saved) return p;
      return { ...p, lat: saved.lat, lng: saved.lng, hasGps: saved.hasGps, warning: saved.warning };
    }));
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionHistory, draftPhotos]);

  function handlePublished(_courseId: string): void {
    navigate('/');
  }

  // Clean up stale configs when draftPhotos changes
  useEffect(() => {
    setPointConfigs(prev => {
      const validIds = new Set(draftPhotos.map(p => p.tempId));
      const cleaned: Record<string, PointConfig> = {};
      for (const id of Object.keys(prev)) {
        if (validIds.has(id)) cleaned[id] = prev[id]!;
      }
      return cleaned;
    });
  }, [draftPhotos]);

  if (loadingCourse) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-500 text-sm">Chargement de la course…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-8 sm:py-10">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Mes parcours
          </button>
          <h1 className="text-2xl font-semibold text-gray-900">
            {isEditMode ? 'Modifier la course' : 'Nouvelle course'}
          </h1>
        </div>

        <PhotoImporter
          onPhotosImported={handlePhotosImported}
          onPhotoRemoved={handlePhotoRemoved}
          initialPhotos={initialPhotos}
        />

        {draftPhotos.length > 0 && (
          <p className="mt-6 text-lg font-medium text-gray-700">
            {draftPhotos.length} point{draftPhotos.length > 1 ? 's' : ''} détecté{draftPhotos.length > 1 ? 's' : ''}
          </p>
        )}

        {draftPhotos.filter(p => !p.hasGps).length > 0 && (
          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <h2 className="text-sm font-semibold text-amber-800 mb-3">
              Photos sans GPS ({draftPhotos.filter(p => !p.hasGps).length}) — positionnez-les manuellement sur la carte ou supprimez-les
            </h2>
            <div className="flex flex-wrap gap-3">
              {draftPhotos.filter(p => !p.hasGps).map(photo => (
                <div key={photo.tempId} className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg p-2">
                  <img src={photo.previewUrl} alt={photo.originalName} className="w-12 h-12 object-cover rounded" />
                  <div>
                    <p className="text-xs text-gray-700 font-medium truncate max-w-32">{photo.originalName}</p>
                    <div className="flex gap-1 mt-1">
                      <button
                        type="button"
                        onClick={() => setPlacingPhotoId(placingPhotoId === photo.tempId ? null : photo.tempId)}
                        className={`text-xs px-2 py-0.5 rounded font-medium ${placingPhotoId === photo.tempId
                            ? 'bg-amber-500 text-white'
                            : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          }`}
                      >
                        {placingPhotoId === photo.tempId ? 'Annuler' : 'Positionner'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemovePhoto(photo.tempId)}
                        className="text-xs px-2 py-0.5 rounded font-medium bg-red-50 text-red-600 hover:bg-red-100"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {placingPhotoId && (
              <p className="mt-2 text-xs text-amber-700">↓ Cliquez sur la carte pour placer la photo</p>
            )}
          </div>
        )}

        {draftPhotos.length > 0 && (
          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Carte des points ({draftPhotos.filter(p => p.hasGps).length} points positionnés)
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setPlacingStartPoint(p => !p); setPlacingPhotoId(null); }}
                  className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors ${placingStartPoint
                      ? 'bg-green-600 border-green-600 text-white'
                      : startPoint
                        ? 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  title="Placer le point de départ sur la carte"
                >
                  <span style={{ display: 'inline-block', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: `12px solid ${placingStartPoint ? 'white' : '#16A34A'}` }} />
                  {placingStartPoint ? 'Cliquez sur la carte…' : startPoint ? 'Départ positionné' : 'Placer le départ'}
                </button>
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={positionHistory.length === 0}
                  className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Annuler le dernier déplacement (Ctrl+Z)"
                >
                  ↩ Annuler
                </button>
              </div>
            </div>
            <div className="flex flex-col-reverse md:flex-row gap-4">
              <div className="w-full md:w-72 flex-shrink-0 flex flex-col">
                <PointEditor
                  draftPhotos={draftPhotos}
                  pointConfigs={pointConfigs}
                  selectedTempId={selectedTempId}
                  onSelect={handleSelectPoint}
                  onConfigChange={handleConfigChange}
                  onRemovePoint={handleRemovePhoto}
                />
              </div>
              <CourseMapEditor
                draftPhotos={draftPhotos}
                pointConfigs={pointConfigs}
                selectedTempId={selectedTempId}
                startPoint={startPoint}
                placingPhotoId={placingPhotoId}
                placingStartPoint={placingStartPoint}
                onRemovePhoto={handleRemovePhoto}
                onSelectPhoto={handleSelectPoint}
                onMapClick={handleMapClick}
                onMarkerDragEnd={handleMarkerDragEnd}
                onStartPointDragEnd={handleStartPointDragEnd}
              />
            </div>
          </section>
        )}

        {draftPhotos.filter(p => p.hasGps).length > 0 && (
          <section className="mt-8">
            <PublishButton
              draftPhotos={draftPhotos}
              pointConfigs={pointConfigs}
              startPoint={startPoint}
              onPublished={handlePublished}
              courseId={courseId}
              initialCourseName={initialCourseName}
              isDraft={isExistingDraft}
            />
          </section>
        )}
      </div>
    </div>
  );
}
