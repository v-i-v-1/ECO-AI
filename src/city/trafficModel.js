const ACTIVITY_TYPES = new Map([
  ["house", 1], ["office", 1.2], ["factory", 1], ["school", 1.2], ["hospital", 1.5],
]);

/** Derives bounded visual traffic density from modeled city activity.
 * Traffic stays presentation-only until the simulation engine gains a traffic profile.
 */
export function getTrafficActivity(objects) {
  const activity = objects.reduce((sum, object) => sum + (ACTIVITY_TYPES.get(object.type) || 0), 0);
  const vehicleCount = activity > 0 ? Math.min(8, 1 + Math.ceil(activity * 0.7)) : 0;
  const busActive = activity >= 3 && vehicleCount >= 3;
  return { activity, vehicleCount, busCount: busActive ? 1 : 0, carCount: vehicleCount - (busActive ? 1 : 0) };
}
