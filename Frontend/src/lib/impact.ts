/**
 * Sustainability impact calculations for swap marketplace.
 * Based on Ellen MacArthur & WRAP estimates: extending garment life by 9 months saves ~20-30% footprint.
 * We use conservative mid-values for easy comprehension.
 */

export const IMPACT_FACTORS = {
  wasteKgPerSwap: 1.8, // kg textile waste diverted per completed swap (avg garment 0.5kg + avoided production waste)
  waterLitersPerSwap: 2700, // liters saved by not producing new (cotton tee ~2700L)
  co2KgPerSwap: 6.5, // kg CO2e avoided
  listingsWeightKg: 0.6, // avg weight per listed item that gets second life
};

export function calcImpact(swapsCompleted: number, listingsCount: number = 0) {
  const swapsWaste = swapsCompleted * IMPACT_FACTORS.wasteKgPerSwap;
  const listingsWaste = listingsCount * 0.3; // listed items that found second life (partial)
  const totalWaste = swapsWaste + listingsWaste;
  return {
    wasteKg: Math.round(totalWaste * 10) / 10,
    waterL: Math.round(swapsCompleted * IMPACT_FACTORS.waterLitersPerSwap),
    co2Kg: Math.round(swapsCompleted * IMPACT_FACTORS.co2KgPerSwap * 10) / 10,
    swaps: swapsCompleted,
    listings: listingsCount,
  };
}

export function formatImpact(impact: ReturnType<typeof calcImpact>) {
  return {
    waste: impact.wasteKg >= 1000 ? `${(impact.wasteKg / 1000).toFixed(1)}t` : `${impact.wasteKg} kg`,
    water: impact.waterL >= 10000 ? `${(impact.waterL / 1000).toFixed(1)}k L` : `${impact.waterL.toLocaleString()} L`,
    co2: `${impact.co2Kg} kg`,
  };
}
