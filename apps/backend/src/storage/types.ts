/**
 * The storage port.
 *
 * `SnapStore` and `ReportStore` are written against this interface rather than
 * against a specific backing store, so the backing store can change without
 * touching either of them — `PostgresStorage` is the implementation.
 *
 * The surface is deliberately the smallest thing the two stores actually use —
 * six operations, all of which Postgres can express. Exposing the full Redis
 * command set here would make the port unimplementable by anything but Redis,
 * which would defeat the point of having one.
 */
export interface StoragePort {
  /** Read a value, or null when the key is absent or unreadable. */
  get(key: string): Promise<string | null>;

  /** Write a value with a time-to-live in seconds. */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;

  /** Prepend to a list — newest first. */
  listPush(key: string, value: string): Promise<void>;

  /** Read a slice of a list, newest first. `limit` counts from the head. */
  listRange(key: string, limit: number): Promise<string[]>;

  /** Discard everything past `max` entries, keeping the newest. */
  listTrim(key: string, max: number): Promise<void>;

  /** Length of a list; 0 when absent. */
  listLength(key: string): Promise<number>;
}
