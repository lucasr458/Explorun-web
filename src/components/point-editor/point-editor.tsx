import { useState, useRef, useEffect } from 'react';
import heic2any from 'heic2any';
import type { DraftPhoto, PointConfig } from '../../types.js';
import { getApiUrl } from '../../services/api.js';

interface Props {
  draftPhotos: DraftPhoto[];
  pointConfigs: Record<string, PointConfig>;
  selectedTempId: string | null;
  onSelect: (tempId: string) => void;
  onConfigChange: (tempId: string, config: PointConfig) => void;
  onRemovePoint: (tempId: string) => void;
}

/** Convertit un fichier HEIC/HEIF en JPEG (Canvas sur Safari, heic2any sur Chrome). */
async function convertToJpegIfNeeded(file: File): Promise<File> {
  const isHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    (file.type === '' && /\.(heic|heif)$/i.test(file.name));
  if (!isHeic) return file;

  // 1er essai : Canvas (Safari/iOS natif)
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    bitmap.close();
    return await new Promise<File>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' }))
            : reject(new Error('toBlob failed')),
        'image/jpeg',
        0.88,
      );
    });
  } catch {
    // Canvas ne supporte pas HEIC — décodeur WASM
  }

  // 2e essai : heic2any
  try {
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.88 });
    const blob = Array.isArray(result) ? result[0]! : result;
    return new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

function ImgWithFallback({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [error, setError] = useState(false);
  // Reset on src change
  useEffect(() => { setError(false); }, [src]);

  if (error) {
    return (
      <div className={`${className} flex items-center justify-center bg-gray-100`}>
        <div className="flex flex-col items-center gap-1 text-gray-400">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs">Aperçu indisponible</span>
        </div>
      </div>
    );
  }

  return <img src={src} alt={alt} className={className} onError={() => setError(true)} />;
}

export function PointEditor({ draftPhotos, pointConfigs, selectedTempId, onConfigChange, onRemovePoint }: Props) {
  const photosWithGps = draftPhotos.filter(p => p.hasGps && p.lat !== undefined && p.lng !== undefined);
  const selectedPhoto = photosWithGps.find(p => p.tempId === selectedTempId) ?? null;
  const selectedConfig = selectedTempId ? (pointConfigs[selectedTempId] ?? null) : null;

  const hintFileInputRef = useRef<HTMLInputElement>(null);

  function updateConfig(partial: Partial<PointConfig>): void {
    if (!selectedTempId) return;
    const current = pointConfigs[selectedTempId] ?? {
      pointOrder: null, teamAssignment: null,
      hintText: null, hintPhotoSource: null, hintPhotoFilename: null,
    };
    onConfigChange(selectedTempId, { ...current, ...partial });
  }

  async function handleHintPhotoSelect(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedTempId) return;

    // Convertir HEIC en JPEG pour garantir l'affichage dans tous les navigateurs
    const displayableFile = await convertToJpegIfNeeded(file);
    updateConfig({
      hintPhotoSource: 'custom',
      hintPhotoFilename: null,
      hintPhotoFile: displayableFile,
    });
  }

  const customHintPreviewUrl =
    selectedConfig?.hintPhotoSource === 'custom' && selectedConfig.hintPhotoFile
      ? URL.createObjectURL(selectedConfig.hintPhotoFile)
      : selectedConfig?.hintPhotoSource === 'custom' && selectedConfig.hintPhotoFilename
        ? `${getApiUrl()}/uploads/${selectedConfig.hintPhotoFilename}`
        : null;

  return (
    <div className="flex flex-col h-full bg-white border border-gray-200 rounded-xl overflow-hidden">
      {!selectedPhoto && (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-sm text-gray-400 italic text-center">
            Cliquez sur un point de la carte pour le configurer
          </p>
        </div>
      )}

      {selectedPhoto && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col">
          {/* Photo principale */}
          <div className="relative">
            <ImgWithFallback
              src={selectedPhoto.previewUrl}
              alt={selectedPhoto.filename}
              className="w-full h-48 object-cover"
            />
            <button
              onClick={() => onRemovePoint(selectedPhoto.tempId)}
              className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded shadow transition-colors"
              title="Supprimer ce point"
            >
              Supprimer
            </button>
          </div>

          <div className="p-4 flex flex-col gap-4">
            {/* Team assignment */}
            <div className="flex gap-2">
              {(['team1', 'team2', 'both'] as const).map(team => (
                <button
                  key={team}
                  onClick={() => updateConfig({ teamAssignment: selectedConfig?.teamAssignment === team ? null : team })}
                  className={`flex-1 py-1.5 text-xs font-medium rounded border transition-colors ${selectedConfig?.teamAssignment === team
                      ? team === 'team1' ? 'bg-blue-600 border-blue-600 text-white'
                        : team === 'team2' ? 'bg-red-600 border-red-600 text-white'
                          : 'bg-green-600 border-green-600 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  {team === 'team1' ? 'Équipe 1' : team === 'team2' ? 'Équipe 2' : 'Les deux'}
                </button>
              ))}
            </div>

            {/* Order */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Numéro du point</label>
              <input
                type="number"
                min="1"
                value={selectedConfig?.pointOrder ?? ''}
                onChange={e => {
                  const val = e.target.value;
                  updateConfig({ pointOrder: val === '' ? null : parseInt(val, 10) });
                }}
                className="w-16 border border-gray-300 rounded px-2 py-1 text-sm"
                placeholder="1"
              />
            </div>

            {/* Hints */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-medium text-gray-600">Indice</p>

              <textarea
                rows={3}
                value={selectedConfig?.hintText ?? ''}
                onChange={e => updateConfig({ hintText: e.target.value === '' ? null : e.target.value })}
                placeholder="Texte d'indice (optionnel)…"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm resize-none"
              />

              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-gray-500">Photo d'indice</p>
                <div className="flex gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`hint-source-${selectedTempId}`}
                      checked={!selectedConfig?.hintPhotoSource}
                      onChange={() => updateConfig({ hintPhotoSource: null, hintPhotoFilename: null })}
                    />
                    <span className="text-xs text-gray-700">Aucune</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`hint-source-${selectedTempId}`}
                      checked={selectedConfig?.hintPhotoSource === 'reference'}
                      onChange={() => updateConfig({ hintPhotoSource: 'reference', hintPhotoFilename: null })}
                    />
                    <span className="text-xs text-gray-700">Référence</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`hint-source-${selectedTempId}`}
                      checked={selectedConfig?.hintPhotoSource === 'custom'}
                      onChange={() => updateConfig({ hintPhotoSource: 'custom', hintPhotoFilename: null })}
                    />
                    <span className="text-xs text-gray-700">Importer</span>
                  </label>
                </div>

                {selectedConfig?.hintPhotoSource === 'reference' && (
                  <ImgWithFallback
                    src={selectedPhoto.previewUrl}
                    alt="Référence"
                    className="w-full h-28 object-contain rounded border border-gray-200 bg-gray-50"
                  />
                )}

                {selectedConfig?.hintPhotoSource === 'custom' && (
                  <div>
                    {customHintPreviewUrl && (
                      <div className="relative">
                        <ImgWithFallback
                          src={customHintPreviewUrl}
                          alt="Indice"
                          className="w-full h-28 object-contain rounded border border-gray-200 bg-gray-50"
                        />
                        <button
                          onClick={() => {
                            if (selectedConfig.hintPhotoFile && customHintPreviewUrl?.startsWith('blob:')) {
                              URL.revokeObjectURL(customHintPreviewUrl);
                            }
                            updateConfig({ hintPhotoFilename: null, hintPhotoFile: undefined });
                          }}
                          className="absolute top-1 right-1 bg-white rounded-full px-1 text-xs text-gray-500 hover:text-red-500 shadow"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    {!customHintPreviewUrl && (
                      <button
                        onClick={() => hintFileInputRef.current?.click()}
                        className="w-full py-2 border border-dashed border-gray-300 rounded text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                      >
                        + Choisir une photo
                      </button>
                    )}
                    <input
                      ref={hintFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={e => void handleHintPhotoSelect(e)}
                      className="hidden"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
