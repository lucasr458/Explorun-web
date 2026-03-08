import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Course } from '../types.js';
import { getCourses, deleteCourse } from '../services/api.js';

export function CoursesListPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    getCourses()
      .then(res => setCourses(res.data))
      .catch(err => setError(err instanceof Error ? err.message : 'Erreur de chargement'))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(course: Course) {
    if (!confirm(`Supprimer la course "${course.name}" ?`)) return;
    setDeletingId(course.id);
    try {
      await deleteCourse(course.id);
      setCourses(prev => prev.filter(c => c.id !== course.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Mes parcours</h1>
          <button
            onClick={() => navigate('/courses/new')}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md text-sm transition-colors"
          >
            Créer une course
          </button>
        </div>

        {loading && (
          <p className="text-gray-500 text-sm">Chargement…</p>
        )}

        {error && (
          <p className="text-red-600 text-sm">{error}</p>
        )}

        {!loading && !error && courses.length === 0 && (
          <p className="text-gray-500 text-sm">Aucune course publiée pour l'instant.</p>
        )}

        {!loading && courses.length > 0 && (
          <ul className="space-y-3">
            {courses.map(course => (
              <li
                key={course.id}
                className="p-4 border border-gray-200 rounded-lg flex items-center justify-between hover:border-gray-300 transition-colors"
              >
                <button
                  className="flex-1 text-left"
                  onClick={() => navigate(`/courses/${course.id}/edit`)}
                >
                  <p className="font-medium text-gray-900 hover:text-green-700">{course.name}</p>
                  <p className="text-sm text-gray-500">
                    {course.pointCount} point{course.pointCount > 1 ? 's' : ''}
                    {' · '}
                    {new Date(course.createdAt).toLocaleDateString('fr-FR')}
                  </p>
                </button>
                <button
                  onClick={() => void handleDelete(course)}
                  disabled={deletingId === course.id}
                  className="ml-4 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50 transition-colors"
                >
                  {deletingId === course.id ? '…' : 'Supprimer'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
