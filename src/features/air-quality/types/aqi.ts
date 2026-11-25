/**
 * AQI index codes as returned by providers. Different standards are never
 * interchangeable: a value must always travel with its scale code.
 *
 * - `ind_cpcb`: India National AQI (Central Pollution Control Board)
 * - `uaqi`: Google Universal AQI
 */
export type AqiScaleCode = "ind_cpcb" | "uaqi";

/**
 * Provenance of a value shown in the UI.
 * - measured: a physical monitoring-station observation
 * - modelled: a spatial model estimate (e.g. a ~500 m grid), not a station
 * - forecast: a provider prediction for a future time
 */
export type DataProvenance = "measured" | "modelled" | "forecast";

export type CpcbAqiCategoryId =
  | "good"
  | "satisfactory"
  | "moderate"
  | "poor"
  | "very_poor"
  | "severe";
