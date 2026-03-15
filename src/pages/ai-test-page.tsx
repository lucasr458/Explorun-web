import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import imageCompression from 'browser-image-compression';
import { getAiThreshold, setAiThreshold, testAiComparison, type AiTestResult } from '../services/api.js';

// Photo joueur — équivalent mobile : resize 800px, JPEG 0.5
async function compressPlayerPhoto(file: File): Promise<{ file: File; preview: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const originalUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(originalUrl);
      const targetWidth = 800;
      const scale = img.width > targetWidth ? targetWidth / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas context unavailable')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('compression failed')); return; }
        const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
        resolve({ file: compressed, preview: URL.createObjectURL(compressed) });
      }, 'image/jpeg', 0.5);
    };
    img.onerror = reject;
    img.src = originalUrl;
  });
}

// Photo de référence — équivalent mobile : max 0.5MB, max 1280px, WebP
async function compressReferencePhoto(file: File): Promise<{ file: File; preview: string }> {
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 1280,
      useWebWorker: true,
      fileType: 'image/webp',
    });
    const result = new File([compressed], file.name.replace(/\.[^.]+$/, '.webp'), {
      type: 'image/webp',
      lastModified: Date.now(),
    });
    return { file: result, preview: URL.createObjectURL(result) };
  } catch {
    return { file, preview: URL.createObjectURL(file) };
  }
}

interface DropZoneProps {
  label: string;
  file: File | null;
  preview: string | null;
  onFile: (file: File) => void;
}

function DropZone({ label, file, preview, onFile }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current++;
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type.startsWith('image/')) onFile(dropped);
  }

  return (
    <div className="flex flex-col">
      <p className="text-sm font-medium text-gray-700 mb-2">{label}</p>
      <div
        onClick={() => inputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragOver={e => e.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative cursor-pointer rounded-lg border-2 border-dashed overflow-hidden transition-colors
          ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'}
        `}
        style={{ aspectRatio: '9/16' }}
      >
        {preview ? (
          <img src={preview} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2 p-4 text-center">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <span className="text-sm">Glisser-déposer<br />ou cliquer</span>
          </div>
        )}
        {dragging && (
          <div className="absolute inset-0 bg-blue-100/60 flex items-center justify-center">
            <span className="text-blue-600 font-medium text-sm">Déposer ici</span>
          </div>
        )}
      </div>
      {file && (
        <p className="mt-1 text-xs text-gray-500 truncate">{file.name}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
    </div>
  );
}

interface CompressedPreviewProps {
  file: File | null;
  preview: string | null;
  compressing: boolean;
}

function CompressedPreview({ file, preview, compressing }: CompressedPreviewProps) {
  if (!file && !compressing) return null;
  return (
    <div className="flex flex-col">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Compressée (envoyée à l'IA)</p>
      <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50" style={{ aspectRatio: '9/16' }}>
        {compressing ? (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
            Compression…
          </div>
        ) : preview ? (
          <img src={preview} alt="compressed" className="w-full h-full object-cover" />
        ) : null}
      </div>
      {file && !compressing && (
        <p className="mt-1 text-xs text-gray-400 truncate">
          {(file.size / 1024).toFixed(0)} Ko · {file.name}
        </p>
      )}
    </div>
  );
}

export function AiTestPage() {
  const navigate = useNavigate();

  const [threshold, setThreshold] = useState<number | null>(null);
  const [thresholdInput, setThresholdInput] = useState('');
  const [thresholdLoading, setThresholdLoading] = useState(false);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [thresholdSuccess, setThresholdSuccess] = useState(false);

  // Original photos (for display in drop zones)
  const [photo1, setPhoto1] = useState<File | null>(null);
  const [photo2, setPhoto2] = useState<File | null>(null);
  const [photo1Preview, setPhoto1Preview] = useState<string | null>(null);
  const [photo2Preview, setPhoto2Preview] = useState<string | null>(null);

  // Compressed photos (sent to AI)
  const [compressed1, setCompressed1] = useState<File | null>(null);
  const [compressed2, setCompressed2] = useState<File | null>(null);
  const [compressed1Preview, setCompressed1Preview] = useState<string | null>(null);
  const [compressed2Preview, setCompressed2Preview] = useState<string | null>(null);
  const [compressing1, setCompressing1] = useState(false);
  const [compressing2, setCompressing2] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AiTestResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  useEffect(() => {
    getAiThreshold()
      .then(res => {
        setThreshold(res.data.threshold);
        setThresholdInput(String(res.data.threshold));
      })
      .catch(() => {});
  }, []);

  async function handleFile(which: 1 | 2, file: File) {
    // Show original preview immediately
    const originalUrl = URL.createObjectURL(file);
    if (which === 1) {
      setPhoto1(file);
      if (photo1Preview) URL.revokeObjectURL(photo1Preview);
      setPhoto1Preview(originalUrl);
      setCompressed1(null);
      setCompressed1Preview(null);
      setCompressing1(true);
    } else {
      setPhoto2(file);
      if (photo2Preview) URL.revokeObjectURL(photo2Preview);
      setPhoto2Preview(originalUrl);
      setCompressed2(null);
      setCompressed2Preview(null);
      setCompressing2(true);
    }
    setResult(null);
    setAnalyzeError(null);

    try {
      const { file: cFile, preview: cPreview } = await (which === 1 ? compressPlayerPhoto(file) : compressReferencePhoto(file));
      if (which === 1) {
        setCompressed1(cFile);
        setCompressed1Preview(cPreview);
      } else {
        setCompressed2(cFile);
        setCompressed2Preview(cPreview);
      }
    } finally {
      if (which === 1) setCompressing1(false);
      else setCompressing2(false);
    }
  }

  async function handleChangeThreshold() {
    const value = parseFloat(thresholdInput);
    if (isNaN(value) || value < 0 || value > 1) {
      setThresholdError('Le seuil doit être un nombre entre 0 et 1');
      return;
    }
    setThresholdLoading(true);
    setThresholdError(null);
    setThresholdSuccess(false);
    try {
      const res = await setAiThreshold(value);
      setThreshold(res.data.threshold);
      setThresholdInput(String(res.data.threshold));
      setThresholdSuccess(true);
      setTimeout(() => setThresholdSuccess(false), 2000);
    } catch (err) {
      setThresholdError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setThresholdLoading(false);
    }
  }

  async function handleAnalyze() {
    if (!compressed1 || !compressed2) return;
    setAnalyzing(true);
    setResult(null);
    setAnalyzeError(null);
    try {
      const res = await testAiComparison(compressed1, compressed2);
      setResult(res.data);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Erreur lors de l\'analyse');
    } finally {
      setAnalyzing(false);
    }
  }

  const confidencePct = result ? Math.round(result.confidence * 100) : null;
  const canAnalyze = !!compressed1 && !!compressed2 && !compressing1 && !compressing2;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-8 py-10">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← Retour
          </button>
          <h1 className="text-2xl font-semibold text-gray-900">Tester l'IA de comparaison</h1>
        </div>

        {/* Threshold section */}
        <div className="mb-8 p-5 border border-gray-200 rounded-lg bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Seuil de confiance</h2>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-600">
              Seuil actuel&nbsp;:&nbsp;
              <span className="font-mono font-bold text-gray-900">
                {threshold !== null ? threshold : '…'}
              </span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={thresholdInput}
                onChange={e => setThresholdInput(e.target.value)}
                className="w-24 px-3 py-1.5 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.86"
              />
              <button
                onClick={() => void handleChangeThreshold()}
                disabled={thresholdLoading}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md disabled:opacity-50 transition-colors"
              >
                {thresholdLoading ? '…' : 'Changer'}
              </button>
            </div>
          </div>
          {thresholdError && <p className="mt-2 text-sm text-red-600">{thresholdError}</p>}
          {thresholdSuccess && <p className="mt-2 text-sm text-green-600">Seuil mis à jour.</p>}
        </div>

        {/* Photos grid: original + compressed side by side */}
        <div className="grid grid-cols-2 gap-8 mb-6">
          {/* Column 1 */}
          <div className="flex flex-col gap-4">
            <DropZone
              label="Photo joueur (à tester)"
              file={photo1}
              preview={photo1Preview}
              onFile={f => void handleFile(1, f)}
            />
            <CompressedPreview
              file={compressed1}
              preview={compressed1Preview}
              compressing={compressing1}
            />
          </div>

          {/* Column 2 */}
          <div className="flex flex-col gap-4">
            <DropZone
              label="Photo de référence"
              file={photo2}
              preview={photo2Preview}
              onFile={f => void handleFile(2, f)}
            />
            <CompressedPreview
              file={compressed2}
              preview={compressed2Preview}
              compressing={compressing2}
            />
          </div>
        </div>

        {/* Analyze button */}
        <button
          onClick={() => void handleAnalyze()}
          disabled={!canAnalyze || analyzing}
          className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {analyzing ? 'Analyse en cours…' : compressing1 || compressing2 ? 'Compression…' : 'Analyser'}
        </button>

        {analyzeError && (
          <p className="mt-4 text-sm text-red-600 text-center">{analyzeError}</p>
        )}

        {/* Result */}
        {result && (
          <div className={`mt-6 p-6 rounded-lg border-2 ${result.success ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}`}>
            <div className="flex items-center justify-between mb-4">
              <span className={`text-lg font-bold ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                {result.success ? 'Correspondance validée' : 'Correspondance refusée'}
              </span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${result.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {result.success ? 'SUCCÈS' : 'ÉCHEC'}
              </span>
            </div>

            <div className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Taux de confiance</span>
                <span className="font-mono font-bold text-gray-900">{confidencePct}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${result.success ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ width: `${confidencePct}%` }}
                />
              </div>
            </div>

            <div className="flex justify-between text-xs text-gray-500">
              <span>Seuil appliqué&nbsp;: <span className="font-mono font-semibold">{result.threshold}</span></span>
              <span>Confiance brute&nbsp;: <span className="font-mono font-semibold">{result.confidence.toFixed(4)}</span></span>
            </div>

            {result.error && (
              <p className="mt-3 text-xs text-orange-600">Info service IA : {result.error}</p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
