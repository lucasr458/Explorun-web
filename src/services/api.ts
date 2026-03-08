import type { ApiResponse, Course, CourseWithPoints, PublishCourseRequest, UploadResponse } from '../types.js';

const API_URL = import.meta.env['VITE_API_URL'] as string ?? 'http://localhost:3001';

export function getApiUrl(): string {
  return API_URL;
}

function getAuthToken(): string | null {
  return sessionStorage.getItem('auth_token');
}

export function setAuthToken(token: string): void {
  sessionStorage.setItem('auth_token', token);
}

export function clearAuthToken(): void {
  sessionStorage.removeItem('auth_token');
}

export function isAuthenticated(): boolean {
  return getAuthToken() !== null;
}

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Basic ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearAuthToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const json = await res.json() as unknown;
  if (!res.ok) {
    const errorJson = json as { error?: { message?: string } };
    throw new Error(errorJson.error?.message ?? 'API error');
  }

  return json as T;
}

export async function uploadPhotos(files: File[]): Promise<ApiResponse<UploadResponse>> {
  const token = getAuthToken();
  const formData = new FormData();
  for (const file of files) {
    formData.append('photos', file);
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Basic ${token}`;
  }

  const res = await fetch(`${API_URL}/api/uploads`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (res.status === 401) {
    clearAuthToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const json = await res.json() as unknown;
  if (!res.ok) {
    const errorJson = json as { error?: { message?: string } };
    throw new Error(errorJson.error?.message ?? 'Upload error');
  }

  return json as ApiResponse<UploadResponse>;
}

export async function deleteUpload(filename: string): Promise<void> {
  await fetchApi<unknown>(`/api/uploads/${encodeURIComponent(filename)}`, { method: 'DELETE' });
}

export async function login(user: string, password: string): Promise<void> {
  const token = btoa(`${user}:${password}`);

  const res = await fetch(`${API_URL}/api/auth/check`, {
    headers: { Authorization: `Basic ${token}` },
  });

  if (res.status === 401) {
    throw new Error('Identifiants incorrects');
  }

  setAuthToken(token);
}

export async function getCourses(): Promise<ApiResponse<Course[]>> {
  return fetchApi<ApiResponse<Course[]>>('/api/courses');
}

export async function getCourse(courseId: string): Promise<ApiResponse<CourseWithPoints>> {
  return fetchApi<ApiResponse<CourseWithPoints>>(`/api/courses/${encodeURIComponent(courseId)}`);
}

export async function updateCourse(
  courseId: string,
  request: PublishCourseRequest
): Promise<ApiResponse<{ courseId: string; pointCount: number }>> {
  return fetchApi<ApiResponse<{ courseId: string; pointCount: number }>>(
    `/api/courses/${encodeURIComponent(courseId)}`,
    { method: 'PUT', body: JSON.stringify(request) }
  );
}

export async function deleteCourse(courseId: string): Promise<void> {
  await fetchApi<unknown>(`/api/courses/${encodeURIComponent(courseId)}`, { method: 'DELETE' });
}

export async function publishCourse(
  request: PublishCourseRequest
): Promise<ApiResponse<{ courseId: string; pointCount: number }>> {
  return fetchApi<ApiResponse<{ courseId: string; pointCount: number }>>(
    '/api/courses',
    {
      method: 'POST',
      body: JSON.stringify(request),
    }
  );
}

export { fetchApi };
