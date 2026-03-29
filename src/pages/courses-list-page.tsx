import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ActiveSession, Course } from '../types.js';
import { getCourses, deleteCourse, getActiveSessions, deleteAllActiveSessions } from '../services/api.js';

export function CoursesListPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [drafts, setDrafts] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [deletingSessions, setDeletingSessions] = useState(false);

  useEffect(() => {
    getCourses()
      .then(res => {
        setCourses(res.data.filter(c => c.published));
        setDrafts(res.data.filter(c => !c.published));
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Erreur de chargement'))
      .finally(() => setLoading(false));

    getActiveSessions()
      .then(res => setSessions(res.data))
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
  }, []);

  async function handleDeleteAllSessions() {
    if (!confirm(`Supprimer toutes les sessions en cours (${sessions.length}) ?`)) return;
    setDeletingSessions(true);
    try {
      await deleteAllActiveSessions();
      setSessions([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    } finally {
      setDeletingSessions(false);
    }
  }

  async function handleDelete(course: Course) {
    if (!confirm(`Supprimer la course "${course.name}" ?`)) return;
    setDeletingId(course.id);
    try {
      await deleteCourse(course.id);
      setCourses(prev => prev.filter(c => c.id !== course.id));
      setDrafts(prev => prev.filter(c => c.id !== course.id));
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/ai-test')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md text-sm transition-colors"
            >
              Tester IA
            </button>
            <button
              onClick={() => navigate('/courses/new')}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md text-sm transition-colors"
            >
              Créer une course
            </button>
          </div>
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

        {!loading && drafts.length > 0 && (
          <div className="mt-8">
            <h2 className="text-base font-semibold text-gray-700 mb-3">Brouillons</h2>
            <ul className="space-y-3">
              {drafts.map(draft => (
                <li
                  key={draft.id}
                  className="p-4 border border-dashed border-gray-300 rounded-lg flex items-center justify-between hover:border-gray-400 transition-colors bg-gray-50"
                >
                  <button
                    className="flex-1 text-left"
                    onClick={() => navigate(`/courses/${draft.id}/edit`)}
                  >
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-800">{draft.name}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Brouillon</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {draft.pointCount} point{draft.pointCount > 1 ? 's' : ''}
                      {' · '}
                      {new Date(draft.updatedAt).toLocaleDateString('fr-FR')}
                    </p>
                  </button>
                  <button
                    onClick={() => void handleDelete(draft)}
                    disabled={deletingId === draft.id}
                    className="ml-4 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50 transition-colors"
                  >
                    {deletingId === draft.id ? '…' : 'Supprimer'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Sessions en cours</h2>
            {sessions.length > 0 && (
              <button
                onClick={() => void handleDeleteAllSessions()}
                disabled={deletingSessions}
                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 border border-red-200 rounded-md disabled:opacity-50 transition-colors"
              >
                {deletingSessions ? '…' : `Supprimer toutes (${sessions.length})`}
              </button>
            )}
          </div>

          {sessionsLoading && (
            <p className="text-gray-500 text-sm">Chargement…</p>
          )}

          {!sessionsLoading && sessions.length === 0 && (
            <p className="text-gray-500 text-sm">Aucune session active pour l'instant.</p>
          )}

          {!sessionsLoading && sessions.length > 0 && (
            <ul className="space-y-3">
              {sessions.map(session => {
                const team1 = session.players.filter(p => p.team === 'team1');
                const team2 = session.players.filter(p => p.team === 'team2');
                return (
                  <li
                    key={session.sessionCode}
                    className="p-4 border border-gray-200 rounded-lg cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors"
                    onClick={() => navigate(`/sessions/${session.sessionCode}`)}
                  >
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono font-bold text-base text-gray-900 tracking-widest">
                        {session.sessionCode}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        session.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {session.status === 'active' ? 'En cours' : 'Lobby'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{session.courseName}</p>
                    <div className="flex gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-blue-600 mb-1">Équipe 1</p>
                        {team1.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {team1.map((p, i) => (
                              <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                                {p.playerName ?? 'Anonyme'}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">Aucun joueur</p>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-orange-600 mb-1">Équipe 2</p>
                        {team2.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {team2.map((p, i) => (
                              <span key={i} className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">
                                {p.playerName ?? 'Anonyme'}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">Aucun joueur</p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
