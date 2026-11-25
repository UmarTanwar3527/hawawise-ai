/**
 * Air-quality thresholds shared by server services and client components.
 * Rationale for each value: docs/air-quality-data.md.
 */

/**
 * Jaipur station data reached OpenAQ about 2.5 h after the hour ended
 * (observed 2026-11-25), so measurements older than 4 h are flagged stale.
 */
export const MEASURED_STALE_AFTER_HOURS = 4;
export const MODELLED_STALE_AFTER_HOURS = 3;
/** Only stations this close to an area are offered as its "nearest station". */
export const NEAREST_STATION_MAX_KM = 10;
