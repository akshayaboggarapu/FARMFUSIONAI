import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCropSuitability,
  calculateSpoilageRisk,
  getCropGradingCriteria,
  getCropStorageGuidance,
  getTransportationGuidance,
  getMarketSellingGuidance,
} from './agronomy.ts';

test('Pre-Harvest crop recommendation returns top 3 matching crops for Kharif with Black soil', () => {
  const recommendations = calculateCropSuitability({
    state: 'Telangana',
    district: 'Warangal',
    landArea: 3.5,
    landUnit: 'acres',
    soilType: 'Black',
    soilFertility: 'High',
    season: 'Kharif',
    waterAvailability: 'Borewell',
    previousCrop: 'Rice',
  });

  assert.equal(recommendations.length, 3);
  // Cotton and Chilli thrive in Kharif with Black soil and Borewell
  const cropKeys = recommendations.map((r) => r.cropKey);
  assert.ok(cropKeys.includes('cotton') || cropKeys.includes('chilli') || cropKeys.includes('rice'));
  assert.ok(recommendations[0].suitabilityScore >= 70);
  assert.ok(recommendations[0].isRuleBased);
});

test('Pre-Harvest respects water constraints: Rice penalized under Rainfed conditions', () => {
  const recommendations = calculateCropSuitability({
    state: 'Andhra Pradesh',
    district: 'Anantapur',
    landArea: 2,
    landUnit: 'acres',
    soilType: 'Red',
    soilFertility: 'Medium',
    season: 'Kharif',
    waterAvailability: 'Rainfed',
    previousCrop: 'Fallow',
  });

  // Rice requires High water, so it shouldn't be the top recommended crop under Rainfed
  assert.notEqual(recommendations[0].cropKey, 'rice');
  // Drought-tolerant groundnut or pulses should rank higher
  const topCrops = recommendations.map((r) => r.cropKey);
  assert.ok(topCrops.includes('groundnut') || topCrops.includes('pulses'));
});

test('Spoilage risk calculation correctly categorizes high perishable crop with severe damage as High Risk', () => {
  const assessment = calculateSpoilageRisk({
    cropName: 'Tomato',
    actualHarvestDate: '2026-10-18',
    harvestQuantity: 25,
    quantityUnit: 'Quintals',
    cropCondition: 'Poor',
    visibleDamage: 'Severe',
    intendedStorageDuration: '1-3 months',
    storageFacility: 'Open shed',
  });

  assert.equal(assessment.riskLevel, 'High');
  assert.ok(assessment.score >= 60);
  assert.ok(assessment.reasons.length > 0);
  assert.ok(assessment.recommendedActions.length > 0);
});

test('Spoilage risk calculation recognizes safe grain storage as Low Risk', () => {
  const assessment = calculateSpoilageRisk({
    cropName: 'Rice (Paddy)',
    cropKey: 'rice',
    actualHarvestDate: '2026-10-15',
    harvestQuantity: 80,
    quantityUnit: 'Quintals',
    cropCondition: 'Excellent',
    visibleDamage: 'None',
    intendedStorageDuration: '1-3 months',
    storageFacility: 'Well-ventilated room',
  });

  assert.equal(assessment.riskLevel, 'Low');
  assert.ok(assessment.score < 35);
});

test('Crop grading provides specific Grade A, B, and C parameters for Tomato', () => {
  const criteria = getCropGradingCriteria('Tomato');
  assert.ok(criteria.gradeA.label.includes('Grade A'));
  assert.ok(criteria.gradeA.characteristics.includes('55mm'));
  assert.ok(criteria.gradeB.characteristics.includes('40mm'));
  assert.ok(criteria.gradeC.buyerCategories.includes('puree') || criteria.gradeC.buyerCategories.includes('chutney'));
  assert.ok(criteria.gradeA.benchmarkPriceMultiplier > criteria.gradeB.benchmarkPriceMultiplier);
  assert.ok(criteria.gradeB.benchmarkPriceMultiplier > criteria.gradeC.benchmarkPriceMultiplier);
});

test('Storage guidance differentiates between Cold storage and ambient', () => {
  const ambientGuidance = getCropStorageGuidance('Tomato', 'Open shed');
  const coldGuidance = getCropStorageGuidance('Tomato', 'Cold storage');

  assert.notEqual(ambientGuidance.expectedStorageLife, coldGuidance.expectedStorageLife);
  assert.ok(coldGuidance.expectedStorageLife.includes('week'));
});
