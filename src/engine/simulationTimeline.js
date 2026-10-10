export const SIMULATED_MINUTES_PER_SECOND = 5;
export const SIMULATION_HISTORY_LIMIT = 8192;
export const SIMULATION_START_MINUTES = 8 * 60;

const ACTIVITY_PROFILES = {
  residential: [0.56, 0.5, 0.46, 0.44, 0.45, 0.52, 0.7, 0.94, 0.86, 0.78, 0.73, 0.72, 0.72, 0.7, 0.71, 0.75, 0.82, 0.96, 1, 0.97, 0.91, 0.8, 0.69, 0.61],
  office: [0.28, 0.25, 0.23, 0.22, 0.22, 0.26, 0.38, 0.62, 0.88, 0.98, 1, 1, 0.94, 0.95, 0.99, 1, 0.96, 0.82, 0.52, 0.36, 0.31, 0.3, 0.29, 0.28],
  school: [0.12, 0.1, 0.09, 0.08, 0.08, 0.1, 0.2, 0.55, 0.94, 1, 0.98, 0.96, 0.9, 0.95, 0.98, 0.82, 0.5, 0.3, 0.2, 0.16, 0.14, 0.13, 0.12, 0.12],
  factory: [0.68, 0.66, 0.64, 0.62, 0.62, 0.7, 0.88, 0.98, 1, 1, 0.98, 0.97, 0.94, 0.96, 0.98, 1, 0.98, 0.9, 0.78, 0.72, 0.7, 0.7, 0.69, 0.68],
  hospital: [0.92, 0.9, 0.9, 0.9, 0.91, 0.92, 0.94, 0.98, 1, 1, 0.99, 0.98, 0.98, 0.98, 0.99, 1, 1, 0.99, 0.98, 0.97, 0.96, 0.95, 0.94, 0.93],
  other: [0.7, 0.68, 0.66, 0.64, 0.64, 0.68, 0.75, 0.84, 0.92, 0.98, 1, 1, 0.98, 0.98, 0.99, 1, 0.98, 0.92, 0.84, 0.78, 0.75, 0.73, 0.72, 0.71],
};
const ACTIVITY_PROFILE_AVERAGES = Object.fromEntries(
  Object.entries(ACTIVITY_PROFILES).map(([name, profile]) => [
    name,
    profile.reduce((total, value) => total + value, 0) / profile.length,
  ]),
);
const SOLAR_HOURLY_PROFILE = [0, 0, 0, 0, 0, 0, 0.12, 0.32, 0.58, 0.8, 0.94, 1, 1, 0.94, 0.8, 0.58, 0.32, 0.12, 0, 0, 0, 0, 0, 0];
const SOLAR_PROFILE_AVERAGE = SOLAR_HOURLY_PROFILE.reduce((sum, value) => sum + value, 0) / SOLAR_HOURLY_PROFILE.length;

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(dateKey, dayOffset) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function getDayOffsetAndMinute(elapsedMinutes, startMinuteOfDay = SIMULATION_START_MINUTES) {
  const totalMinutes = Math.floor(startMinuteOfDay + elapsedMinutes);
  const dayOffset = Math.floor(totalMinutes / 1440);
  const minuteOfDay = ((totalMinutes % 1440) + 1440) % 1440;
  return { dayOffset, minuteOfDay };
}

export function createInitialSimulationClock(startDate = localDateKey(), startMinuteOfDay = SIMULATION_START_MINUTES) {
  return {
    elapsedMinutes: 0,
    startDate,
    startMinuteOfDay,
    cumulative: { energy: 0, renewable: 0, co2: 0, water: 0, waste: 0 },
  };
}

export function formatSimulationClock(elapsedMinutes, startDate = localDateKey(), startMinuteOfDay = SIMULATION_START_MINUTES) {
  const { dayOffset, minuteOfDay } = getDayOffsetAndMinute(elapsedMinutes, startMinuteOfDay);
  const hours = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
  const minutes = String(minuteOfDay % 60).padStart(2, "0");
  return {
    time: `${hours}:${minutes}`,
    date: shiftDate(startDate, dayOffset),
    day: dayOffset + 1,
    dayOffset,
    hour: minuteOfDay / 60,
  };
}

function profileForType(type) {
  if (type === "house") return "residential";
  if (type === "office") return "office";
  if (type === "school") return "school";
  if (type === "factory") return "factory";
  if (type === "hospital") return "hospital";
  return "other";
}

function getActivityFactor(type, hour, isWeekend) {
  const profileName = profileForType(type);
  const profile = ACTIVITY_PROFILES[profileName];
  const hourIndex = Math.floor(hour) % 24;
  const nextHourIndex = (hourIndex + 1) % 24;
  const fraction = hour - Math.floor(hour);
  const hourlyValue = profile[hourIndex] * (1 - fraction) + profile[nextHourIndex] * fraction;
  const weekdayAverage = ACTIVITY_PROFILE_AVERAGES[profileName];
  const weekendScale = isWeekend
    ? ({ residential: 1.08, office: 0.32, school: 0.05, factory: 0.55, hospital: 1, other: 0.8 }[profileName] || 0.8)
    : 1;
  return (hourlyValue / weekdayAverage) * weekendScale;
}

function getSolarFactor(hour) {
  const hourlyOutput = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  return hourlyOutput / SOLAR_PROFILE_AVERAGE;
}

export function createTemporalSimulationProfile(clock, {
  objectDetails = [],
  cityObjects = [],
  solarGeneration = 0,
  windGeneration = 0,
  indicators = {},
  stepMinutes = 0,
} = {}) {
  const { date, hour } = formatSimulationClock(clock.elapsedMinutes, clock.startDate, clock.startMinuteOfDay);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const isWeekend = weekday === 0 || weekday === 6;
  const midpointHour = (hour + stepMinutes / 120) % 24;

  let baseEnergy = 0;
  let profiledEnergy = 0;
  let baseWater = 0;
  let profiledWater = 0;
  let baseWaste = 0;
  let profiledWaste = 0;
  let totalOccupants = 0;
  let activeOccupants = 0;
  const cityObjectsById = new Map(cityObjects.map((object) => [object.id, object]));

  objectDetails.forEach((detail) => {
    const energy = Math.max(0, Number(detail.impact?.energy) || 0);
    const water = Math.max(0, Number(detail.impact?.water) || 0);
    const waste = Math.max(0, Number(detail.impact?.waste) || 0);
    const activity = getActivityFactor(detail.type, midpointHour, isWeekend);
    baseEnergy += energy;
    profiledEnergy += energy * activity;
    baseWater += water;
    profiledWater += water * activity;
    baseWaste += waste;
    profiledWaste += waste * activity;

    const object = cityObjectsById.get(detail.id);
    const occupants = Math.max(0, Number(object?.occupants ?? object?.parameters?.occupants) || 0);
    totalOccupants += occupants;
    activeOccupants += occupants * activity;
  });

  const solarFactor = getSolarFactor(midpointHour);
  const windFactor = Math.max(0.75, Math.min(1.25, 1 + 0.14 * Math.sin(((midpointHour + 3) / 24) * Math.PI * 2)));
  const totalRenewable = solarGeneration + windGeneration;
  const renewableRate = solarGeneration * solarFactor + windGeneration * windFactor;
  const energyFactor = baseEnergy > 0 ? profiledEnergy / baseEnergy : 1;
  const waterFactor = baseWater > 0 ? profiledWater / baseWater : energyFactor;
  const wasteFactor = baseWaste > 0 ? profiledWaste / baseWaste : energyFactor;

  return {
    energyFactor,
    waterFactor,
    wasteFactor,
    renewableFactor: totalRenewable > 0 ? renewableRate / totalRenewable : 0,
    renewableRate,
    activityPercent: totalOccupants > 0 ? Math.max(0, Math.min(100, (activeOccupants / totalOccupants) * 100)) : 0,
    co2Pressure: Math.min(100, Math.max(0, (indicators.co2Pressure || 0) * energyFactor)),
    energyPressure: Math.min(100, Math.max(0, (indicators.energyPressure || 0) * energyFactor)),
    waterPressure: Math.min(100, Math.max(0, (indicators.waterPressure || 0) * waterFactor)),
  };
}

export function advanceSimulationClock(clock, {
  speed,
  demand,
  renewableGeneration,
  solarGeneration = renewableGeneration,
  windGeneration = 0,
  impact,
  temporalInputs = {},
}) {
  const stepMinutes = speed * SIMULATED_MINUTES_PER_SECOND;
  const scale = stepMinutes / 1440;
  const temporalProfile = createTemporalSimulationProfile({
    ...clock,
    elapsedMinutes: clock.elapsedMinutes + stepMinutes / 2,
  }, { ...temporalInputs, solarGeneration, windGeneration, stepMinutes });
  const energyFactor = temporalProfile.energyFactor;
  return {
    ...clock,
    elapsedMinutes: clock.elapsedMinutes + stepMinutes,
    temporalProfile,
    cumulative: {
      energy: clock.cumulative.energy + Math.max(0, demand) * energyFactor * scale,
      renewable: clock.cumulative.renewable + temporalProfile.renewableRate * scale,
      co2: clock.cumulative.co2 + impact.co2 * energyFactor * scale,
      water: clock.cumulative.water + impact.water * temporalProfile.waterFactor * scale,
      waste: clock.cumulative.waste + impact.waste * temporalProfile.wasteFactor * scale,
    },
  };
}

export function createSimulationSample({ clock, impact, sustainabilityScore, temporalProfile = {} }) {
  const { time, date, day } = formatSimulationClock(clock.elapsedMinutes, clock.startDate, clock.startMinuteOfDay);
  return {
    elapsedMinutes: clock.elapsedMinutes,
    label: `${date} ${time}`,
    date,
    time,
    day,
    dayOffset: day - 1,
    ...clock.cumulative,
    land: impact.landUsage,
    greenCover: impact.greenCover,
    sustainabilityScore,
    activityPercent: temporalProfile.activityPercent ?? 0,
    co2Pressure: temporalProfile.co2Pressure ?? 0,
    energyPressure: temporalProfile.energyPressure ?? 0,
    waterPressure: temporalProfile.waterPressure ?? 0,
  };
}

export function getNextSimulationHourTimestamp(clock) {
  const { date, time } = formatSimulationClock(clock.elapsedMinutes, clock.startDate, clock.startMinuteOfDay);
  const [hours] = time.split(":").map(Number);
  const nextHour = new Date(`${date}T00:00:00Z`);
  nextHour.setUTCHours(hours + 1, 0, 0, 0);
  return `${nextHour.toISOString().slice(0, 10)}T${nextHour.toISOString().slice(11, 19)}`;
}
