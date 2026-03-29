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

// Sessions
export interface ActiveSession {
  sessionCode: string;
  status: 'waiting' | 'active';
  courseName: string;
  players: Array<{ playerName: string | null; team: string }>;
}

export interface SessionPoint {
  id: string;
  pointOrder: number;
  teamAssignment: 'team1' | 'team2' | 'both';
  lat: number;
  lng: number;
  hintText: string | null;
  hintPhotoPath: string | null;
}

export interface SessionState {
  sessionCode: string;
  status: string;
  courseId: string;
  courseName: string;
  startLocation: { lat: number; lng: number } | null;
  points: SessionPoint[];
  teamProgress: { team1: string[]; team2: string[] };
}

export interface SessionPlayer {
  id: string;
  playerName: string | null;
  team: string;
  role: string;
  joinedAt: string;
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
  file?: File; // Optional for existing photos loaded from server
  filename: string;
  originalName: string;
  //serverPath: string;
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
  hintPhotoFile?: File; // Local file for custom hint photos
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
  published?: boolean; // false = brouillon, true (défaut) = publié
}
