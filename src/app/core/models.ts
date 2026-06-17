/** Shared API types for the Aikido Video Library frontend. */

export interface Teacher {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

/** Result of a CSV import (TECHNICAL_SPEC.md §3.5). */
export interface ImportResult {
  created: number;
  merged: number;
  skipped: number;
  errors: { row: number; name: string; reason: string }[];
}

export interface Video {
  id: string;
  title: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  embedUrl: string;
  descriptionJson: unknown | null;
  descriptionText: string | null;
  keywords: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Payload for creating/updating a video. Description is a TipTap JSON document. */
export interface VideoInput {
  title: string;
  youtubeUrl: string;
  descriptionJson?: unknown | null;
  keywords: string[];
}

export interface ApiError {
  error: { code: string; message: string };
}
