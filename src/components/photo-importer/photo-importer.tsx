import { useRef, useState, useEffect } from 'react';
import type { DraftPhoto, PhotoImportSummary } from '../../types.js';
import { usePhotoImport } from '../../hooks/use-photo-import.js';

interface PhotoImporterProps {
  onPhotosImported: (photos: DraftPhoto[]) => void;
  initialPhotos?: DraftPhoto[];
}

function PhotoGridItem({
  photo,
  isProcessing,
  onRemove,
}: {
  photo: DraftPhoto;
  isProcessing: boolean;
  onRemove: (tempId: string) => void;
}) {
  return (
    <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
      <img src={photo.previewUrl} alt={photo.filename} className="w-full h-full object-cover" />

      {isProcessing ? (
        <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="absolute bottom-1 left-1">
            {photo.hasGps ? (
              <span className="bg-green-100 text-green-700 text-xs px-1 rounded font-medium">GPS</span>
            ) : (
              <span
                className="bg-amber-100 text-amber-700 text-xs px-1 rounded font-medium"
                title={photo.warning}
              >
                ⚠
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onRemove(photo.tempId)}
            className="absolute top-1 right-1 bg-white rounded-full p-0.5 shadow text-gray-500 hover:text-red-500 leading-none"
            aria-label="Supprimer"
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
}

function SummaryBar({ summary }: { summary: PhotoImportSummary }) {
  if (summary.total === 0) return null;
  return (
    <p className="text-sm text-gray-600 mt-3">
      <span className="font-medium">{summary.total}</span> photos importées
      {' · '}
      <span className="text-green-700 font-medium">{summary.withGps}</span> prêtes
      {summary.withoutGps > 0 && (
        <>
          {' · '}
          <span className="text-amber-600 font-medium">{summary.withoutGps}</span> sans GPS
        </>
      )}
    </p>
  );
}

export function PhotoImporter({ onPhotosImported, initialPhotos }: PhotoImporterProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { photos, summary, isProcessing, processPhotos, removePhoto } = usePhotoImport(initialPhotos);

  useEffect(() => {
    if (initialPhotos && initialPhotos.length > 0) {
      onPhotosImported(initialPhotos);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files).filter((f) =>
      ['image/jpeg', 'image/png', 'image/webp'].includes(f.type),
    );
    if (fileArray.length === 0) return;
    setError(null);
    try {
      const updated = await processPhotos(fileArray);
      onPhotosImported(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'import');
    }
  }

  async function handleRemove(tempId: string) {
    const updated = await removePhoto(tempId);
    onPhotosImported(updated);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    void handleFiles(e.dataTransfer.files);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    void handleFiles(e.target.files);
    e.target.value = '';
  }

  return (
    <div className="w-full">
      {/* Drop zone */}
      <div
        onDragOver={isProcessing ? undefined : handleDragOver}
        onDragLeave={isProcessing ? undefined : handleDragLeave}
        onDrop={isProcessing ? undefined : handleDrop}
        onClick={isProcessing ? undefined : () => fileInputRef.current?.click()}
        className={[
          'border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center transition-colors',
          isProcessing
            ? 'border-green-400 bg-green-50 cursor-default'
            : isDragOver
              ? 'border-green-600 bg-green-50 cursor-pointer'
              : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50 cursor-pointer',
        ].join(' ')}
      >
        {isProcessing ? (
          <>
            <div className="w-10 h-10 border-3 border-green-600 border-t-transparent rounded-full animate-spin mb-3" style={{ borderWidth: '3px' }} />
            <p className="text-green-700 text-sm font-medium">Traitement en cours…</p>
          </>
        ) : (
          <>
            <svg className="w-10 h-10 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-gray-600 text-sm font-medium">
              Glissez vos photos ici ou cliquez pour sélectionner
            </p>
            <p className="text-gray-400 text-xs mt-1">JPEG, PNG, WEBP · max 10 Mo par photo</p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={handleInputChange}
          className="hidden"
        />
      </div>

      <SummaryBar summary={summary} />

      {error && (
        <p className="mt-3 text-sm text-red-600">
          Erreur : {error}
        </p>
      )}
    </div>
  );
}
