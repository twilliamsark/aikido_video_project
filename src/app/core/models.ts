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
  shared: boolean;
  shareToken: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Public-facing video (TECHNICAL_SPEC.md §7.2): no owner/plaintext fields. */
export interface PublicVideo {
  id: string;
  title: string;
  youtubeVideoId: string;
  embedUrl: string;
  descriptionJson: unknown | null;
  keywords: string[];
  shareToken: string;
  createdAt: string;
}

export interface PublicVideoList {
  videos: PublicVideo[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ShareInfo {
  token: string | null;
  active: boolean;
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
