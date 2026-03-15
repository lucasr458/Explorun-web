import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { CoursesListPage } from './pages/courses-list-page';
import { CourseEditorPage } from './pages/course-editor-page';
import { SessionDetailPage } from './pages/session-detail-page';
import { LoginPage } from './pages/login-page';
import { AiTestPage } from './pages/ai-test-page';
import { isAuthenticated } from './services/api';
import './styles/tailwind.css';

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <CoursesListPage />
            </RequireAuth>
          }
        />
        <Route
          path="/courses/new"
          element={
            <RequireAuth>
              <CourseEditorPage />
            </RequireAuth>
          }
        />
        <Route
          path="/courses/:courseId/edit"
          element={
            <RequireAuth>
              <CourseEditorPage />
            </RequireAuth>
          }
        />
        <Route
          path="/sessions/:code"
          element={
            <RequireAuth>
              <SessionDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/ai-test"
          element={
            <RequireAuth>
              <AiTestPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
