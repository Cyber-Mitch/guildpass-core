/**
 * Typed error thrown by {@link GuildPassClient} when an API request fails
 * or returns an unexpected response shape.
 *
 * Consumers can catch this class and inspect the structured fields instead
 * of parsing a free-form `Error` message string.
 */
export class GuildPassApiError extends Error {
  /** HTTP status code returned by the API (0 when the request never reached it). */
  public readonly statusCode: number;

  /** Request path relative to the client's base URL (e.g. `/v1/access/check`). */
  public readonly path: string;

  /** Raw response body as a string, truncated for safety. Empty when unavailable. */
  public readonly responseBody: string;

  constructor(params: {
    statusCode: number;
    path: string;
    message: string;
    responseBody?: string;
  }) {
    super(params.message);
    this.name = 'GuildPassApiError';
    this.statusCode = params.statusCode;
    this.path = params.path;
    this.responseBody = params.responseBody ?? '';
    // Preserve correct prototype chain when targeting older runtimes.
    Object.setPrototypeOf(this, GuildPassApiError.prototype);
  }
}
