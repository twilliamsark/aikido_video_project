/**
 * YouTube URL parsing (TECHNICAL_SPEC.md §7.4, §8.3).
 *
 * Extracts the canonical 11-character video ID from the common YouTube URL
 * shapes. The server stores this ID and uses it to build the privacy-enhanced
 * embed URL; it rejects anything that does not yield a valid ID.
 */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Returns the 11-char video ID, or `null` if the input is not a valid YouTube URL. */
export function parseYouTubeId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');

  // https://youtu.be/<id>
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0] ?? '';
    return VIDEO_ID.test(id) ? id : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    // https://youtube.com/watch?v=<id>
    const v = url.searchParams.get('v');
    if (v && VIDEO_ID.test(v)) return v;

    // /embed/<id>, /shorts/<id>, /live/<id>
    const m = url.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
    if (m && m[1]) return m[1];
  }

  return null;
}

/** Builds the privacy-enhanced embed URL for a parsed video ID. */
export function embedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}
