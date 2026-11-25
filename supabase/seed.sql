-- Hawa AI · reference seed data (idempotent)
--
-- Contains providers and Jaipur interface areas only. It contains NO
-- environmental measurements: readings come from provider integrations.
--
-- The areas below are interface areas for the UI, not monitoring stations.
-- Coordinates are approximate anchor points, retrieved 2026-11-24 from
-- OpenStreetMap Nominatim (© OpenStreetMap contributors, ODbL). The source of
-- each point is recorded in coordinate_source.

insert into public.data_sources (provider, source_type, display_name, website_url, is_active)
values
  -- Deferred: requires a Google Cloud billing account.
  ('google_air_quality', 'modelled_grid', 'Google Air Quality API',
   'https://developers.google.com/maps/documentation/air-quality', false),
  ('open_meteo', 'modelled_grid', 'Open-Meteo Air Quality API',
   'https://open-meteo.com', true),
  ('openaq', 'station_network', 'OpenAQ',
   'https://openaq.org', true),
  -- Reference only until an authorised CPCB data-access method is confirmed.
  ('cpcb', 'official_reference', 'CPCB National AQI',
   'https://app.cpcbccr.com/AQIIndia', false)
on conflict (provider, source_type) do update set
  display_name = excluded.display_name,
  website_url = excluded.website_url,
  is_active = excluded.is_active;

insert into public.locations (slug, name, latitude, longitude, location_type, coordinate_source)
values
  ('jaipur-city-centre', 'Jaipur city centre', 26.9124, 75.7873, 'city_centre',
   'Project brief: approximate Jaipur city-centre coordinates'),
  ('vaishali-nagar', 'Vaishali Nagar', 26.90957, 75.73917, 'neighbourhood',
   'OpenStreetMap Nominatim: place=suburb "Vaishali Nagar"'),
  ('mansarovar', 'Mansarovar', 26.87560, 75.75090, 'neighbourhood',
   'OpenStreetMap Nominatim: place=neighbourhood "Mansarovar Sector 4"'),
  ('malviya-nagar', 'Malviya Nagar', 26.85776, 75.81424, 'neighbourhood',
   'OpenStreetMap Nominatim: landmark in Malviya Nagar (no area record in OSM); refine later'),
  ('c-scheme', 'C-Scheme', 26.90756, 75.80551, 'neighbourhood',
   'OpenStreetMap Nominatim: Statue Circle landmark (no C-Scheme area record in OSM); refine later'),
  ('bani-park', 'Bani Park', 26.93165, 75.79580, 'neighbourhood',
   'OpenStreetMap Nominatim: place=suburb "Bani Park"'),
  ('sitapura', 'Sitapura', 26.78274, 75.83794, 'neighbourhood',
   'OpenStreetMap Nominatim: place=suburb "Sitapura"'),
  ('jagatpura', 'Jagatpura', 26.83357, 75.82730, 'neighbourhood',
   'OpenStreetMap Nominatim: place=suburb "Jagatpura"'),
  ('mi-road', 'MI Road', 26.91602, 75.80153, 'neighbourhood',
   'OpenStreetMap Nominatim: point on MI Road (Police Commissionerate)')
on conflict (slug) do update set
  name = excluded.name,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  location_type = excluded.location_type,
  coordinate_source = excluded.coordinate_source;
