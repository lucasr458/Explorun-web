// API response wrapper
export interface ApiResponse<T> {
  data: T;
}

// Courses
export interface Course {
  id: string;
  name: string;
  pointCount: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CoursePoint {
  id: string;
  courseId: string;
  pointOrder: number;
  teamAssignment: 'team1' | 'team2' | 'both';
  lat: number;
  lng: number;
  hintText: string | null;
  hintPhotoPath: string | null;
  referencePhotoPath: string;
  createdAt: string;
}

export interface CourseWithPoints {
  course: Course & { startLat: number | null; startLng: number | null };
  points: CoursePoint[];
}

// Upload
export interface UploadedFile {
  tempId: string;
  filename: string;
  path: string;
  url: string;
}

export interface UploadResponse {
  files: UploadedFile[];
}

// Draft photo (client-side state before publishing)
export interface DraftPhoto {
  tempId: string;
  filename: string;
  originalName: string;
  serverPath: string;
  previewUrl: string;
  hasGps: boolean;
  lat?: number;
  lng?: number;
  warning?: string;
}

export interface PhotoImportSummary {
  total: number;
  withGps: number;
  withoutGps: number;
}

// Point configuration (editor state)
export interface PointConfig {
  pointOrder: number | null;
  teamAssignment: 'team1' | 'team2' | 'both' | null;
  hintText: string | null;
  hintPhotoSource: 'reference' | 'custom' | null;
  hintPhotoFilename: string | null;
}

// Publish payload
export interface PublishPointPayload {
  pointOrder: number;
  teamAssignment: string;
  lat: number;
  lng: number;
  hintText: string | null;
  hintPhotoPath: string | null;
  referencePhotoPath: string;
}

export interface PublishCourseRequest {
  name: string;
  points: PublishPointPayload[];
  startPoint: { lat: number; lng: number } | null;
}
