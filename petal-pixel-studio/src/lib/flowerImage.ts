/**
 * Public MinIO/S3 base URL for flower preview PNGs. Mirrors the backend's
 * `S3_PUBLIC_BASE_URL` (docker-compose.yml) so the default works with zero
 * config in local dev. Override via `VITE_FLOWER_IMAGE_BASE_URL`.
 *
 * SOLE producer of this contract (per the v3 plan's binding conflict
 * resolutions) — every card across the studio (dashboard + galleries) imports
 * `flowerImageUrl`/`FlowerThumb` from here rather than rebuilding the URL shape.
 */
export const flowerImageBaseUrl =
  import.meta.env.VITE_FLOWER_IMAGE_BASE_URL || 'http://localhost:9000/flower';

/**
 * Public URL for a flower's preview PNG. The backend stores previews at
 * `images/<flower_id>.png` (flower-backend/cmd/server/main.go builds the same
 * `<base>/images/<id>.png` shape from `S3_PUBLIC_BASE_URL`; see also
 * internal/assets/s3uploader.go's `PublicURL`). Pure: collapses a trailing
 * slash in `base` and `encodeURIComponent()`s the id — same shape rules as
 * `buildShareUrl` in `integrations/flowerBackend/client.ts`.
 */
export function flowerImageUrl(flowerId: string, base: string = flowerImageBaseUrl): string {
  return `${base.replace(/\/+$/, '')}/images/${encodeURIComponent(flowerId)}.png`;
}
