/**
 * Where the API keeps public files: Announcement posters. The interface is
 * small on purpose: store a file, read one back, remove some, and say the
 * public address of one. Supabase Storage is the real one.
 */
export interface FileStore {
  /** Stores `bytes` at `path`. Fails when something is already there: paths are never reused. */
  put(path: string, bytes: Buffer, contentType: string): Promise<void>;
  /** The file at `path`. */
  get(path: string): Promise<Buffer>;
  /** Removes these files. Paths with nothing there are skipped. */
  remove(paths: readonly string[]): Promise<void>;
  /** The address anyone can load the file from, with no session. */
  publicUrl(path: string): string;
}

export interface SupabaseFileStoreOptions {
  /** The Supabase project URL. Storage lives under it at /storage/v1. */
  url: string;
  /** The secret (service role) key: the only key that may write to the bucket. */
  secretKey: string;
  /** A public-read bucket. */
  bucket: string;
}

/** A year: every stored path holds one version of a file forever, so caches may keep it. */
const CACHE_SECONDS = 365 * 24 * 3600;

/** Supabase Storage over its HTTP API, as the API itself (the secret key). */
export class SupabaseFileStore implements FileStore {
  readonly #storageUrl: string;
  readonly #secretKey: string;
  readonly #bucket: string;

  constructor(options: SupabaseFileStoreOptions) {
    this.#storageUrl = `${options.url.replace(/\/+$/, "")}/storage/v1`;
    this.#secretKey = options.secretKey;
    this.#bucket = options.bucket;
  }

  async put(path: string, bytes: Buffer, contentType: string): Promise<void> {
    const response = await this.#request("POST", `/object/${this.#bucket}/${encodePath(path)}`, {
      body: new Uint8Array(bytes),
      headers: { "content-type": contentType, "cache-control": `max-age=${CACHE_SECONDS}`, "x-upsert": "false" },
    });
    if (!response.ok) throw new Error(`Supabase Storage could not store ${path}: ${response.status} ${await response.text()}`);
  }

  async get(path: string): Promise<Buffer> {
    const response = await this.#request("GET", `/object/${this.#bucket}/${encodePath(path)}`);
    if (!response.ok) throw new Error(`Supabase Storage could not read ${path}: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  async remove(paths: readonly string[]): Promise<void> {
    if (paths.length === 0) return;
    const response = await this.#request("DELETE", `/object/${this.#bucket}`, {
      body: JSON.stringify({ prefixes: paths }),
      headers: { "content-type": "application/json" },
    });
    if (!response.ok) throw new Error(`Supabase Storage could not remove ${paths.join(", ")}: ${response.status}`);
  }

  publicUrl(path: string): string {
    return `${this.#storageUrl}/object/public/${this.#bucket}/${encodePath(path)}`;
  }

  #request(method: string, path: string, init: { body?: BodyInit; headers?: Record<string, string> } = {}): Promise<Response> {
    return fetch(`${this.#storageUrl}${path}`, {
      method,
      headers: { apikey: this.#secretKey, authorization: `Bearer ${this.#secretKey}`, ...init.headers },
      body: init.body,
      signal: AbortSignal.timeout(20_000),
    });
  }
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/** The store of Announcement images: the public `announcements` bucket of the project's Supabase Storage (created by the announcements migration). */
export function announcementFiles(config: { supabaseUrl: string; supabaseSecretKey: string }): FileStore {
  return new SupabaseFileStore({ url: config.supabaseUrl, secretKey: config.supabaseSecretKey, bucket: "announcements" });
}
