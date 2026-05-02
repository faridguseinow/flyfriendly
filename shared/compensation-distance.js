const EARTH_RADIUS_KM = 6371;
const SHORT_DISTANCE_LIMIT_KM = 1500;
const MEDIUM_DISTANCE_LIMIT_KM = 3500;
const CURRENCY = "EUR";

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getLatitude(airport) {
  return toNumber(
    airport?.latitude_deg
      ?? airport?.latitudeDeg
      ?? airport?.latitude
      ?? airport?.lat,
  );
}

function getLongitude(airport) {
  return toNumber(
    airport?.longitude_deg
      ?? airport?.longitudeDeg
      ?? airport?.longitude
      ?? airport?.lng
      ?? airport?.lon,
  );
}

function roundDistanceKm(value) {
  return Math.round(value * 10) / 10;
}

function getAirportIdentity(airport) {
  if (!airport) {
    return null;
  }

  return {
    id: airport.id ?? null,
    code: airport.iata_code || airport.icao_code || airport.ident || airport.code || null,
    name: airport.name || null,
    city: airport.municipality || airport.city || null,
    country: airport.country_name || airport.country || airport.iso_country || null,
  };
}

export function calculateDistanceKm(fromAirport, toAirport) {
  const fromLatitude = getLatitude(fromAirport);
  const fromLongitude = getLongitude(fromAirport);
  const toLatitude = getLatitude(toAirport);
  const toLongitude = getLongitude(toAirport);

  if (
    fromLatitude === null
    || fromLongitude === null
    || toLatitude === null
    || toLongitude === null
  ) {
    return null;
  }

  const deltaLatitude = toRadians(toLatitude - fromLatitude);
  const deltaLongitude = toRadians(toLongitude - fromLongitude);
  const originLatitude = toRadians(fromLatitude);
  const destinationLatitude = toRadians(toLatitude);

  const haversine =
    Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(deltaLongitude / 2) ** 2;

  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return roundDistanceKm(EARTH_RADIUS_KM * arc);
}

export function getDistanceBand(distanceKm) {
  const normalizedDistance = toNumber(distanceKm);

  if (normalizedDistance === null) {
    return "unknown";
  }

  if (normalizedDistance <= SHORT_DISTANCE_LIMIT_KM) {
    return "short";
  }

  if (normalizedDistance <= MEDIUM_DISTANCE_LIMIT_KM) {
    return "medium";
  }

  return "long";
}

export function getEstimatedCompensation(distanceKm) {
  const band = getDistanceBand(distanceKm);

  if (band === "short") {
    return 250;
  }

  if (band === "medium") {
    return 400;
  }

  if (band === "long") {
    return 600;
  }

  return null;
}

export function buildEstimateExplanation({
  fromAirport,
  toAirport,
  distanceKm,
  band,
  amount,
  reasonCodes,
} = {}) {
  const normalizedBand = band || getDistanceBand(distanceKm);
  const normalizedAmount = amount ?? getEstimatedCompensation(distanceKm);
  const normalizedReasonCodes = Array.isArray(reasonCodes) ? reasonCodes : [];

  return {
    method: "haversine",
    rule_set: "eu261_distance_bands_v1",
    from_airport: getAirportIdentity(fromAirport),
    to_airport: getAirportIdentity(toAirport),
    distance_km: distanceKm ?? null,
    distance_band: normalizedBand,
    estimated_compensation_eur: normalizedAmount,
    compensation_currency: CURRENCY,
    reason_codes: normalizedReasonCodes,
  };
}

export function calculateDistanceCompensationEstimate({ fromAirport, toAirport } = {}) {
  const distanceKm = calculateDistanceKm(fromAirport, toAirport);

  if (distanceKm === null) {
    const reasonCodes = ["missing_airport_coordinates"];

    return {
      distanceKm: null,
      distanceBand: "unknown",
      estimatedCompensationEur: null,
      currency: CURRENCY,
      estimateStatus: "pending_review",
      reasonCodes,
      estimateExplanation: buildEstimateExplanation({
        fromAirport,
        toAirport,
        distanceKm: null,
        band: "unknown",
        amount: null,
        reasonCodes,
      }),
    };
  }

  const distanceBand = getDistanceBand(distanceKm);
  const estimatedCompensationEur = getEstimatedCompensation(distanceKm);
  const reasonCodes = [
    "distance_calculated",
    `distance_band_${distanceBand}`,
    estimatedCompensationEur ? `estimated_compensation_${estimatedCompensationEur}_eur` : null,
  ].filter(Boolean);

  return {
    distanceKm,
    distanceBand,
    estimatedCompensationEur,
    currency: CURRENCY,
    estimateStatus: "calculated",
    reasonCodes,
    estimateExplanation: buildEstimateExplanation({
      fromAirport,
      toAirport,
      distanceKm,
      band: distanceBand,
      amount: estimatedCompensationEur,
      reasonCodes,
    }),
  };
}

export const COMPENSATION_DISTANCE_RULES = {
  short: { maxDistanceKm: SHORT_DISTANCE_LIMIT_KM, amountEur: 250 },
  medium: { minDistanceKmExclusive: SHORT_DISTANCE_LIMIT_KM, maxDistanceKm: MEDIUM_DISTANCE_LIMIT_KM, amountEur: 400 },
  long: { minDistanceKmExclusive: MEDIUM_DISTANCE_LIMIT_KM, amountEur: 600 },
};
