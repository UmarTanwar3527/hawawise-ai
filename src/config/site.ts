/**
 * Static product configuration. Contains no secrets and is safe to import
 * from client and server code.
 */
export const siteConfig = {
  name: "Hawa AI",
  shortName: "Hawa",
  tagline: "Urban air-quality intelligence",
  description:
    "Evidence-grounded urban air-quality intelligence for everyday decisions, piloting in Jaipur, Rajasthan.",
  pilotCity: {
    name: "Jaipur",
    state: "Rajasthan",
    countryCode: "IN",
    /** Approximate city-centre coordinates used as the default location. */
    centre: { latitude: 26.9124, longitude: 75.7873 },
  },
} as const;

export function formatCoordinates(latitude: number, longitude: number): string {
  const lat = `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? "N" : "S"}`;
  const lng = `${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? "E" : "W"}`;
  return `${lat}, ${lng}`;
}
