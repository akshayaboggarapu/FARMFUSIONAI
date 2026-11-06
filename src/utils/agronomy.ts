/**
 * Pure Agronomy Logic & Rule-Based Engines for FarmFusion AI
 * Used by both server-side AI fallback and unit-tested for deterministic recommendations.
 */

export interface PreHarvestInputs {
  state: string;
  district: string;
  village?: string;
  landArea: number;
  landUnit: string; // 'acres' | 'hectares' | 'guntas'
  soilType: string; // 'Alluvial' | 'Black' | 'Red' | 'Sandy' | 'Clay' | 'Loamy' | 'Laterite'
  soilFertility: string; // 'High' | 'Medium' | 'Low'
  soilPh?: number;
  nitrogen?: number;
  phosphorus?: number;
  potassium?: number;
  previousCrop?: string;
  previousYield?: string;
  season: string; // 'Kharif' | 'Rabi' | 'Zaid'
  waterAvailability: string; // 'Canal' | 'Borewell' | 'Drip' | 'Sprinkler' | 'Rainfed'
  weatherCondition?: string; // 'Sunny' | 'Moderate rain' | 'Heavy rain' | 'Drought-prone' | 'Humid'
  cultivationBudget?: number;
}

export interface CropRecommendation {
  cropName: string;
  cropKey: string;
  imageUrl: string;
  suitabilityScore: number; // 0 - 100
  soilSuitability: string;
  weatherSeasonSuitability: string;
  waterRequirement: string;
  expectedDuration: string;
  recommendedSowingPeriod: string;
  estimatedYieldRange: string;
  explanation: string;
  isRuleBased: boolean;
}

export interface PostHarvestInputs {
  cropName: string;
  cropKey?: string;
  actualHarvestDate: string;
  harvestQuantity: number;
  quantityUnit: string; // 'Quintals' | 'Tonnes' | 'Kg' | 'Crates'
  cropCondition: string; // 'Excellent' | 'Good' | 'Fair' | 'Poor'
  visibleDamage: string; // 'None' | 'Minor bruising' | 'Pest spots' | 'Moisture damage' | 'Severe'
  intendedStorageDuration: string; // '<3 days' | '1-2 weeks' | '1-3 months' | '3-6 months'
  storageFacility: string; // 'Open shed' | 'Traditional granary' | 'Well-ventilated room' | 'Cold storage' | 'Silo'
  intendedMarket?: string;
}

export interface SpoilageAssessment {
  riskLevel: 'Low' | 'Moderate' | 'High';
  score: number; // 0 - 100 (higher = higher risk)
  reasons: string[];
  recommendedActions: string[];
}

export interface CropGradingCriteria {
  gradeA: {
    label: string;
    characteristics: string;
    visibleDefects: string;
    handling: string;
    storageSuggestion: string;
    buyerCategories: string;
    benchmarkPriceMultiplier: number;
  };
  gradeB: {
    label: string;
    characteristics: string;
    visibleDefects: string;
    handling: string;
    storageSuggestion: string;
    buyerCategories: string;
    benchmarkPriceMultiplier: number;
  };
  gradeC: {
    label: string;
    characteristics: string;
    visibleDefects: string;
    handling: string;
    storageSuggestion: string;
    buyerCategories: string;
    benchmarkPriceMultiplier: number;
  };
}

// Master Agronomy Knowledge Base
export const CROPS_DB: Record<string, {
  name: string;
  key: string;
  idealSoils: string[];
  idealSeasons: string[];
  waterReqLevel: 'Low' | 'Medium' | 'High';
  idealPh: [number, number];
  durationDays: string;
  sowingPeriods: Record<string, string>;
  avgYieldPerAcre: string;
  perishability: 'High' | 'Medium' | 'Low';
  tempRange: string;
  humidityRange: string;
  basePricePerQuintal: number;
  imageUrl: string;
}> = {
  rice: {
    name: 'Rice (Paddy)',
    key: 'rice',
    idealSoils: ['Alluvial', 'Clay', 'Loamy'],
    idealSeasons: ['Kharif', 'Rabi'],
    waterReqLevel: 'High',
    idealPh: [5.5, 7.0],
    durationDays: '120 - 150 days',
    sowingPeriods: { Kharif: 'June - July', Rabi: 'November - December' },
    avgYieldPerAcre: '20 - 28 Quintals/Acre',
    perishability: 'Low',
    tempRange: '15°C - 24°C (Moisture < 13%)',
    humidityRange: '55% - 65% RH',
    basePricePerQuintal: 2200,
    imageUrl: 'https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?auto=format&fit=crop&w=600&q=80',
  },
  wheat: {
    name: 'Wheat',
    key: 'wheat',
    idealSoils: ['Alluvial', 'Loamy', 'Black'],
    idealSeasons: ['Rabi'],
    waterReqLevel: 'Medium',
    idealPh: [6.0, 7.5],
    durationDays: '110 - 130 days',
    sowingPeriods: { Rabi: 'October - November' },
    avgYieldPerAcre: '18 - 24 Quintals/Acre',
    perishability: 'Low',
    tempRange: '15°C - 20°C (Moisture < 12%)',
    humidityRange: '50% - 60% RH',
    basePricePerQuintal: 2275,
    imageUrl: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=600&q=80',
  },
  cotton: {
    name: 'Cotton',
    key: 'cotton',
    idealSoils: ['Black', 'Alluvial'],
    idealSeasons: ['Kharif'],
    waterReqLevel: 'Medium',
    idealPh: [6.0, 8.0],
    durationDays: '150 - 180 days',
    sowingPeriods: { Kharif: 'May - July' },
    avgYieldPerAcre: '8 - 14 Quintals/Acre',
    perishability: 'Low',
    tempRange: '20°C - 28°C (Dry, well-ventilated)',
    humidityRange: '45% - 60% RH',
    basePricePerQuintal: 7120,
    imageUrl: 'https://images.unsplash.com/photo-1605000797499-95a51c5269ae?auto=format&fit=crop&w=600&q=80',
  },
  tomato: {
    name: 'Tomato',
    key: 'tomato',
    idealSoils: ['Red', 'Loamy', 'Black'],
    idealSeasons: ['Kharif', 'Rabi', 'Zaid'],
    waterReqLevel: 'Medium',
    idealPh: [6.0, 7.0],
    durationDays: '90 - 110 days',
    sowingPeriods: { Kharif: 'June - July', Rabi: 'October - November', Zaid: 'January - February' },
    avgYieldPerAcre: '120 - 200 Quintals/Acre',
    perishability: 'High',
    tempRange: '10°C - 13°C (Refrigerated) or 18°C - 22°C (Short term)',
    humidityRange: '85% - 90% RH',
    basePricePerQuintal: 1800,
    imageUrl: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80',
  },
  maize: {
    name: 'Maize (Corn)',
    key: 'maize',
    idealSoils: ['Alluvial', 'Red', 'Loamy'],
    idealSeasons: ['Kharif', 'Rabi'],
    waterReqLevel: 'Medium',
    idealPh: [5.8, 7.2],
    durationDays: '90 - 110 days',
    sowingPeriods: { Kharif: 'June - July', Rabi: 'October - November' },
    avgYieldPerAcre: '22 - 30 Quintals/Acre',
    perishability: 'Low',
    tempRange: '18°C - 25°C (Moisture < 14%)',
    humidityRange: '50% - 65% RH',
    basePricePerQuintal: 2090,
    imageUrl: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&w=600&q=80',
  },
  chilli: {
    name: 'Red Chilli',
    key: 'chilli',
    idealSoils: ['Black', 'Red', 'Loamy'],
    idealSeasons: ['Kharif', 'Rabi'],
    waterReqLevel: 'Medium',
    idealPh: [6.0, 7.5],
    durationDays: '130 - 160 days',
    sowingPeriods: { Kharif: 'July - August', Rabi: 'October - November' },
    avgYieldPerAcre: '15 - 25 Quintals/Acre',
    perishability: 'Medium',
    tempRange: '18°C - 24°C (Moisture < 10% after sun drying)',
    humidityRange: '50% - 60% RH',
    basePricePerQuintal: 14500,
    imageUrl: 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?auto=format&fit=crop&w=600&q=80',
  },
  groundnut: {
    name: 'Groundnut (Peanut)',
    key: 'groundnut',
    idealSoils: ['Sandy', 'Red', 'Loamy'],
    idealSeasons: ['Kharif', 'Rabi'],
    waterReqLevel: 'Low',
    idealPh: [5.5, 7.0],
    durationDays: '105 - 125 days',
    sowingPeriods: { Kharif: 'June - July', Rabi: 'November - December' },
    avgYieldPerAcre: '10 - 16 Quintals/Acre',
    perishability: 'Low',
    tempRange: '20°C - 25°C (Moisture < 8%)',
    humidityRange: '50% - 60% RH',
    basePricePerQuintal: 6377,
    imageUrl: 'https://images.unsplash.com/photo-1567894340315-735d7c361db0?auto=format&fit=crop&w=600&q=80',
  },
  onion: {
    name: 'Onion',
    key: 'onion',
    idealSoils: ['Alluvial', 'Red', 'Loamy', 'Black'],
    idealSeasons: ['Kharif', 'Rabi', 'Zaid'],
    waterReqLevel: 'Medium',
    idealPh: [6.0, 7.0],
    durationDays: '110 - 140 days',
    sowingPeriods: { Kharif: 'June - July', Rabi: 'October - November', Zaid: 'January - February' },
    avgYieldPerAcre: '80 - 130 Quintals/Acre',
    perishability: 'Medium',
    tempRange: '25°C - 30°C (Cured, well-aerated) or 0°C - 2°C (Cold storage)',
    humidityRange: '65% - 70% RH',
    basePricePerQuintal: 2400,
    imageUrl: 'https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&w=600&q=80',
  },
  pulses: {
    name: 'Pulses (Pigeon Pea / Green Gram)',
    key: 'pulses',
    idealSoils: ['Loamy', 'Black', 'Red', 'Alluvial'],
    idealSeasons: ['Kharif', 'Rabi'],
    waterReqLevel: 'Low',
    idealPh: [6.0, 7.5],
    durationDays: '90 - 140 days',
    sowingPeriods: { Kharif: 'June - July', Rabi: 'October - November' },
    avgYieldPerAcre: '6 - 10 Quintals/Acre',
    perishability: 'Low',
    tempRange: '18°C - 25°C (Moisture < 10%)',
    humidityRange: '50% - 60% RH',
    basePricePerQuintal: 7000,
    imageUrl: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?auto=format&fit=crop&w=600&q=80',
  }
};

/**
 * Deterministic Rule-Based Pre-Harvest Crop Suitability Engine
 */
export function calculateCropSuitability(inputs: PreHarvestInputs): CropRecommendation[] {
  const scoredCrops = Object.values(CROPS_DB).map((crop) => {
    let score = 25; // discriminative base score

    // 1. Soil match (up to +25)
    if (crop.idealSoils.includes(inputs.soilType)) {
      score += 25;
    } else if (inputs.soilType === 'Loamy' || inputs.soilType === 'Alluvial') {
      score += 12; // versatile soils
    } else {
      score += 4;
    }

    // 2. Season match (up to +25, penalty if wrong)
    if (crop.idealSeasons.includes(inputs.season)) {
      score += 25;
    } else {
      score -= 25; // major penalty for wrong season
    }

    // 3. Water availability vs crop requirement
    const isWaterAbundant = inputs.waterAvailability === 'Canal' || inputs.waterAvailability === 'Borewell' || inputs.waterAvailability === 'Drip';
    const isRainfed = inputs.waterAvailability === 'Rainfed';

    if (crop.waterReqLevel === 'High') {
      if (isWaterAbundant) score += 20;
      else if (isRainfed) score -= 30; // heavy penalty for water-guzzling crop in rainfed land
      else score += 5;
    } else if (crop.waterReqLevel === 'Low') {
      if (isRainfed) score += 22; // highly suitable for rainfed
      else score += 12;
    } else {
      // Medium water requirement
      if (isWaterAbundant) score += 18;
      else if (isRainfed) score += 4; // risky under dry rainfed
      else score += 12;
    }

    // 4. Fertility bonus / penalty
    if (inputs.soilFertility === 'Low') {
      if (crop.key === 'pulses' || crop.key === 'groundnut') score += 8; // nitrogen fixers
      else if (crop.key === 'rice' || crop.key === 'maize') score -= 8; // heavy nutrient feeders
    } else if (inputs.soilFertility === 'High') {
      score += 5;
    }

    // 5. Soil pH match if provided
    if (inputs.soilPh !== undefined && inputs.soilPh > 0) {
      if (inputs.soilPh >= crop.idealPh[0] && inputs.soilPh <= crop.idealPh[1]) {
        score += 8;
      } else {
        score -= 8;
      }
    }

    // 6. Crop rotation bonus: avoid same previous crop
    if (inputs.previousCrop && inputs.previousCrop.toLowerCase().includes(crop.key)) {
      score -= 15; // penalize monocropping
    } else if (inputs.previousCrop && (inputs.previousCrop.toLowerCase().includes('legume') || inputs.previousCrop.toLowerCase().includes('pulse'))) {
      score += 8; // nitrogen fixing rotation benefit
    }

    // Clamp score 25 - 96
    const finalScore = Math.max(25, Math.min(96, score));

    const sowingPeriod = crop.sowingPeriods[inputs.season] || 'Current agro-climatic window';

    return {
      cropName: crop.name,
      cropKey: crop.key,
      imageUrl: crop.imageUrl,
      suitabilityScore: finalScore,
      soilSuitability: `${inputs.soilType} soil is ${crop.idealSoils.includes(inputs.soilType) ? 'highly compatible' : 'moderately adaptable'} with ${crop.name}.`,
      weatherSeasonSuitability: `${inputs.season} season provides ideal photoperiod and temperature for optimal vegetative development.`,
      waterRequirement: `${crop.waterReqLevel} Water Requirement — best paired with ${inputs.waterAvailability} irrigation.`,
      expectedDuration: crop.durationDays,
      recommendedSowingPeriod: sowingPeriod,
      estimatedYieldRange: crop.avgYieldPerAcre,
      explanation: `Recommended based on ${inputs.soilType} soil texture, ${inputs.season} seasonal climate, and ${inputs.waterAvailability} water infrastructure. Crop rotation from previous ${inputs.previousCrop || 'fallow'} enhances soil nutrient balance.`,
      isRuleBased: true,
    };
  });

  // Sort descending by suitability score and return top 3
  scoredCrops.sort((a, b) => b.suitabilityScore - a.suitabilityScore);
  return scoredCrops.slice(0, 3);
}

/**
 * Transparent Spoilage Risk Calculation Engine
 */
export function calculateSpoilageRisk(inputs: PostHarvestInputs): SpoilageAssessment {
  let score = 20; // baseline low risk
  const reasons: string[] = [];
  const recommendedActions: string[] = [];

  const crop = Object.values(CROPS_DB).find(
    (c) => c.key === inputs.cropKey || c.name.toLowerCase().includes(inputs.cropName.toLowerCase())
  );
  const perishability = crop?.perishability || (inputs.cropName.toLowerCase().includes('tomato') ? 'High' : 'Medium');

  // 1. Crop Perishability
  if (perishability === 'High') {
    score += 30;
    reasons.push(`${inputs.cropName} is inherently high-perishable with delicate skin and rapid post-harvest respiration.`);
  } else if (perishability === 'Medium') {
    score += 15;
    reasons.push(`${inputs.cropName} has moderate shelf stability requiring controlled humidity.`);
  } else {
    score += 5;
    reasons.push(`${inputs.cropName} is a staple grain/pulse with low moisture susceptibility when properly dried.`);
  }

  // 2. Visible damage
  if (inputs.visibleDamage === 'Severe') {
    score += 35;
    reasons.push('Severe visible damage creates entry points for fungal pathogens, black rot, and bacterial soft rot.');
    recommendedActions.push('Immediately sort and quarantine damaged produce to prevent spread to sound lots.');
  } else if (inputs.visibleDamage === 'Moisture damage') {
    score += 25;
    reasons.push('Excessive moisture detected; promotes rapid mold proliferation and aflatoxin formation.');
    recommendedActions.push('Spread produce thinly on tarpaulins under ventilated shade to reduce surface moisture.');
  } else if (inputs.visibleDamage === 'Pest spots' || inputs.visibleDamage === 'Minor bruising') {
    score += 15;
    reasons.push('Minor surface blemishes and bruising reduce mechanical resistance to decay during storage.');
    recommendedActions.push('Grade out bruised items for immediate processing or fast-turnaround local sale.');
  }

  // 3. Storage facility vs duration
  const isColdStorage = inputs.storageFacility === 'Cold storage';
  const isOpenShed = inputs.storageFacility === 'Open shed';
  const isLongTerm = inputs.intendedStorageDuration === '1-3 months' || inputs.intendedStorageDuration === '3-6 months';

  if (isOpenShed && isLongTerm) {
    score += 25;
    reasons.push('Open shed storage exposed to ambient temperature and pest infiltration for extended holding.');
    recommendedActions.push('Transfer to a certified warehouse or cold chain facility if holding beyond 10 days.');
  } else if (isColdStorage) {
    score -= 20;
    reasons.push('Cold storage maintains controlled temperature and suppresses physiological decay.');
  } else if (inputs.storageFacility === 'Well-ventilated room') {
    reasons.push('Ventilated ambient storage provides adequate passive air movement for short to medium cycles.');
  }

  if (inputs.cropCondition === 'Poor') {
    score += 20;
    reasons.push('Crop condition at harvest was rated poor, accelerating ethylene release and cellular breakdown.');
    recommendedActions.push('Expedite immediate dispatch to local mandi or processing units within 24-48 hours.');
  }

  // Clamp score
  const finalScore = Math.max(10, Math.min(95, score));
  let riskLevel: 'Low' | 'Moderate' | 'High' = 'Low';

  if (finalScore >= 60) {
    riskLevel = 'High';
  } else if (finalScore >= 35) {
    riskLevel = 'Moderate';
  } else {
    riskLevel = 'Low';
  }

  if (recommendedActions.length === 0) {
    recommendedActions.push('Maintain clean, dry pallets and monitor relative humidity twice weekly.');
    recommendedActions.push('Follow first-in, first-out (FIFO) inventory dispatch for commercial lots.');
  }

  return {
    riskLevel,
    score: finalScore,
    reasons,
    recommendedActions,
  };
}

/**
 * Crop Specific Grading Guidance
 */
export function getCropGradingCriteria(cropName: string): CropGradingCriteria {
  const lower = cropName.toLowerCase();

  if (lower.includes('tomato')) {
    return {
      gradeA: {
        label: 'Grade A (Premium / Table Purpose)',
        characteristics: 'Uniform red or breaker color, firm texture, spherical/oval shape, diameter 55mm - 70mm, glossy skin.',
        visibleDefects: 'Zero cracking, zero pest punctures, no blossom-end rot, free of mechanical abrasions.',
        handling: 'Pack in ventilated plastic crates (15 - 20 kg max), single to double layer with soft separators.',
        storageSuggestion: 'Store at 10°C - 13°C and 85% - 90% RH. Do not stack crates higher than 6 levels.',
        buyerCategories: 'Supermarket retail chains, premium urban vegetable vendors, export procurement.',
        benchmarkPriceMultiplier: 1.25,
      },
      gradeB: {
        label: 'Grade B (Commercial / Processing)',
        characteristics: 'Good firmness, slight color variation or slight asymmetry, diameter 40mm - 55mm.',
        visibleDefects: 'Minor healed skin blemishes (<5% surface), no deep tears or leaking juice.',
        handling: 'Standard wooden or plastic crates with dry newspaper cushioning.',
        storageSuggestion: 'Ambient ventilated storage for up to 3 - 5 days, or cool room for 10 days.',
        buyerCategories: 'Local wholesale mandi, sauce/ketchup processing factories, institutional caterers.',
        benchmarkPriceMultiplier: 0.90,
      },
      gradeC: {
        label: 'Grade C (Immediate Clearance / Puree)',
        characteristics: 'Over-ripe or small sizing (<40mm), softer flesh, irregular shapes.',
        visibleDefects: 'Sun scald, visible bruising, minor soft spots, harvest scuffs.',
        handling: 'Process or sell within 24 hours. Keep out of direct sun.',
        storageSuggestion: 'Immediate processing or dispatch. Do not store with Grade A produce.',
        buyerCategories: 'Local chutney/puree makers, community markets, animal feed supplement.',
        benchmarkPriceMultiplier: 0.55,
      },
    };
  }

  if (lower.includes('rice') || lower.includes('paddy')) {
    return {
      gradeA: {
        label: 'Grade A (Superfine / Export Quality)',
        characteristics: 'Moisture content <= 13%, grain length > 6.6mm, head rice recovery > 62%, pristine golden husk.',
        visibleDefects: 'Zero chalky kernels, zero discolored or damaged grains, zero foreign matter / stones.',
        handling: 'Pack in clean, new HDPE/Jute bags (50kg), machine stitched, stacked on wooden pallets.',
        storageSuggestion: 'Dry warehouse at 18°C - 24°C, stack 1 meter away from walls, fumigated.',
        buyerCategories: 'Export milling houses, premium packaged basmati/sona masoori branders.',
        benchmarkPriceMultiplier: 1.20,
      },
      gradeB: {
        label: 'Grade B (Common / Standard Milling)',
        characteristics: 'Moisture 13% - 14.5%, medium grain length, normal hulling yield 55% - 60%.',
        visibleDefects: 'Less than 2% immature/chalky grains, foreign organic matter < 1%.',
        handling: 'Standard 50kg jute gunny bags, stored on raised dunnage.',
        storageSuggestion: 'Traditional granary or covered godown with periodic moisture testing.',
        buyerCategories: 'FCI (Food Corporation of India) / State Civil Supplies, local commercial rice mills.',
        benchmarkPriceMultiplier: 1.0,
      },
      gradeC: {
        label: 'Grade C (Sub-Standard / Feed Grade)',
        characteristics: 'Moisture > 15%, higher broken grain ratio (>25%), discolored hulls.',
        visibleDefects: 'Weather stained, mold signs, insect bore holes, excessive chaff.',
        handling: 'Immediate sun-drying required to drop moisture below 13%.',
        storageSuggestion: 'Cannot be stored safely without re-drying; risk of heating and yellowing.',
        buyerCategories: 'Cattle & poultry feed millers, starch and alcohol distillery units.',
        benchmarkPriceMultiplier: 0.65,
      },
    };
  }

  if (lower.includes('cotton')) {
    return {
      gradeA: {
        label: 'Grade A (Extra Long Staple / Clean)',
        characteristics: 'Staple length > 29mm, Micronaire 3.5 - 4.5, high reflectance (Rd > 75), zero yellow stain.',
        visibleDefects: 'Trash content < 2%, zero seed coat fragments, zero plastic/polypropylene fiber contamination.',
        handling: 'Press into standard 170kg bales using 100% cotton wrapping cloth.',
        storageSuggestion: 'Dry shed on pallets, relative humidity < 60%, strict fire safety protocol.',
        buyerCategories: 'Export textile spinning mills, premium denim and fine count yarn manufacturers.',
        benchmarkPriceMultiplier: 1.20,
      },
      gradeB: {
        label: 'Grade B (Standard Medium Staple)',
        characteristics: 'Staple length 24mm - 28mm, Micronaire 3.2 - 4.8, creamy white appearance.',
        visibleDefects: 'Trash content 2% - 4%, minor leaf bracts.',
        handling: 'Standard bale packaging, protected from ground moisture.',
        storageSuggestion: 'Covered godown with tarpaulins.',
        buyerCategories: 'Cotton Corporation of India (CCI) procurement, domestic composite textile mills.',
        benchmarkPriceMultiplier: 0.95,
      },
      gradeC: {
        label: 'Grade C (Short / Stained Staple)',
        characteristics: 'Staple length < 23mm, dull grayish or yellow stained lint.',
        visibleDefects: 'High leaf trash (>5%), insect damaged bolls, water soaked cotton.',
        handling: 'Dry thoroughly; sell to ginners specializing in coarse count open-end yarn.',
        storageSuggestion: 'Immediate ginning recommended.',
        buyerCategories: 'Surgical cotton manufacturers, mattress fillers, coarse fabric units.',
        benchmarkPriceMultiplier: 0.65,
      },
    };
  }

  // Generic / Default Agricultural Crop Criteria
  return {
    gradeA: {
      label: 'Grade A (Superior Market Quality)',
      characteristics: 'Prime maturity, uniform size and color, peak freshness, firm physiological structure.',
      visibleDefects: 'Completely free from pests, mechanical cuts, rot, or discolouration.',
      handling: 'Clean crates or new food-grade bags, careful loading to avoid shock.',
      storageSuggestion: 'Ideal storage parameters with precise ventilation and temperature management.',
      buyerCategories: 'Tier-1 wholesale mandis, organized supermarket aggregators, premium buyers.',
      benchmarkPriceMultiplier: 1.20,
    },
    gradeB: {
      label: 'Grade B (Fair Average Quality - FAQ)',
      characteristics: 'Standard commercial grade, slight size variation, good internal soundness.',
      visibleDefects: 'Minor superficial marks (<10% area), no decay or inner pulp damage.',
      handling: 'Standard gunny bags or commercial cartons on wooden dunnage.',
      storageSuggestion: 'Well-ventilated ambient godowns with clean pest-proof flooring.',
      buyerCategories: 'Regional mandis, government procurement, institutional food processors.',
      benchmarkPriceMultiplier: 1.0,
    },
    gradeC: {
      label: 'Grade C (Second Grade / Processing)',
      characteristics: 'Mixed sizes, uneven color, lower aesthetic appeal or near-expiration freshness.',
      visibleDefects: 'Visible surface scuffs, misshapen specimens, high moisture or minor sunburn.',
      handling: 'Immediate handling and rapid turnover.',
      storageSuggestion: 'Shortest possible holding window (<48 hours) prior to processing or clearance.',
      buyerCategories: 'Secondary wholesale merchants, local processing mills, livestock feed buyers.',
      benchmarkPriceMultiplier: 0.60,
    },
  };
}

/**
 * Crop Specific Storage Recommendations
 */
export function getCropStorageGuidance(cropName: string, facility: string) {
  const lower = cropName.toLowerCase();
  const crop = Object.values(CROPS_DB).find(
    (c) => c.name.toLowerCase().includes(lower) || lower.includes(c.key)
  );

  const tempRange = crop ? crop.tempRange : '18°C - 24°C';
  const humidityRange = crop ? crop.humidityRange : '55% - 65% RH';
  const perishability = crop ? crop.perishability : 'Medium';

  let shelfLife = '2 - 3 weeks';
  if (perishability === 'High') {
    shelfLife = facility === 'Cold storage' ? '2 - 3 weeks' : '3 - 6 days';
  } else if (perishability === 'Low') {
    shelfLife = '6 - 12 months (if moisture < 12%)';
  } else {
    shelfLife = facility === 'Cold storage' ? '2 - 3 months' : '3 - 5 weeks';
  }

  return {
    recommendedMethod: perishability === 'High'
      ? 'Pre-cooled cold chain storage or shaded evaporative cool chambers with active air flow.'
      : 'Raised wooden pallets inside dry, pest-sealed, moisture-barrier godown.',
    idealTemperature: tempRange,
    idealHumidity: humidityRange,
    ventilationGuidance: 'Ensure cross-ventilation during cool morning hours. Avoid opening doors during high humidity rainy spells.',
    packagingGuidance: perishability === 'High'
      ? 'Corrugated fiberboard boxes or stackable food-grade plastic crates with perforated sidewalls.'
      : 'Multi-layer hermetic bags (Purdue Improved Crop Storage - PICS) or high-density jute bags on dunnage.',
    expectedStorageLife: shelfLife,
    spoilageFactors: [
      'High internal product moisture causing fungal mycelium expansion.',
      'Poor air circulation leading to heat hotspots and condensation dripping.',
      'Rodent and beetle infestation in grain warehouses.',
      'Direct sunlight causing sunburn, chlorophyll degradation, or rapid moisture loss.',
    ],
  };
}

/**
 * Transportation Recommendations
 */
export function getTransportationGuidance(cropName: string, quantity: number, unit: string, market: string) {
  const lower = cropName.toLowerCase();
  const isHighPerishable = lower.includes('tomato') || lower.includes('mango') || lower.includes('vegetable');

  return {
    vehicleType: isHighPerishable
      ? 'Refrigerated or insulated reefer truck for distances > 80km; ventilated pickup with wet gunny sheet cover for local mandis.'
      : 'Covered canopy truck or tractor trailer with clean waterproof PVC tarpaulins.',
    packingRequirement: isHighPerishable
      ? 'Rigid plastic crates stacked maximum 6 high, cushioned with dry straw/corrugated liners to absorb transit shocks.'
      : 'Stitched 50kg bags stacked in interlocking brick pattern, secured with cargo tie-down ropes.',
    handlingInstructions: 'Load in early morning or late evening to minimize heat buildup. Ensure driver avoids rough unpaved roads where possible.',
    urgency: isHighPerishable ? 'High (Deliver within 8 - 18 hours of harvest)' : 'Moderate (Standard scheduled commercial dispatch)',
    estimatedTransitPrecautions: 'Inspect suspension and ensure top cover prevents rain penetration while allowing exhaust ventilation.',
  };
}

/**
 * Market & Selling Guidance
 */
export function getMarketSellingGuidance(cropName: string, quantity: number, gradeDistribution: { gradeA: number; gradeB: number; gradeC: number }) {
  const lower = cropName.toLowerCase();
  const crop = Object.values(CROPS_DB).find(
    (c) => c.name.toLowerCase().includes(lower) || lower.includes(c.key)
  );

  const basePrice = crop ? crop.basePricePerQuintal : 2500;
  const gradeAPrice = Math.round(basePrice * 1.22);
  const gradeBPrice = Math.round(basePrice * 1.0);
  const gradeCPrice = Math.round(basePrice * 0.60);

  return {
    benchmarkMandiPrices: {
      gradeA: { price: gradeAPrice, label: `₹${gradeAPrice} / Quintal (Grade A Premium)` },
      gradeB: { price: gradeBPrice, label: `₹${gradeBPrice} / Quintal (Grade B Standard)` },
      gradeC: { price: gradeCPrice, label: `₹${gradeCPrice} / Quintal (Grade C Clearance)` },
    },
    dataSource: 'Government Agmarknet / APMC Mandi Benchmark Daily Feed (Illustrative Agronomy Standard)',
    sellingChannels: [
      {
        channel: 'APMC District Mandi / Regulated Yard',
        suitability: 'Ideal for bulk volumes of Grade A and Grade B produce through authorized commission agents.',
        paymentTerms: 'Direct bank transfer / e-NAM electronic settlement within 24-48 hours.',
      },
      {
        channel: 'Direct Farmgate Aggregator / FPO Procurement',
        suitability: 'Saves transportation costs and loading labor; transparent digital weighing.',
        paymentTerms: 'Spot digital payment or same-day cash.',
      },
      {
        channel: 'Food Processing Units / Local Value Addition',
        suitability: 'Best outlet for Grade C produce (purees, animal feed, starch) avoiding complete disposal loss.',
        paymentTerms: 'Contractual settlement upon quality inspection.',
      },
    ],
    timingAdvice: 'Morning auction (6:00 AM - 9:00 AM) traditionally commands 5% to 8% higher bidding due to peak urban retailer demand.',
  };
}
