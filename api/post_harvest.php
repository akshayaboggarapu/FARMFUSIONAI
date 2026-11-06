<?php
/**
 * FarmFusion AI — Post-Harvest API (PHP/MySQL)
 * Connects the Pre-Harvest selected crop cycle to harvest logging, grading, storage, spoilage, transport & market guidance
 */

require_once __DIR__ . '/../config.php';

$userId = requireAuth();
$db = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// 1. GET DETAILS OF A SPECIFIC CROP CYCLE FOR POST-HARVEST
if ($method === 'GET' && $action === 'get_cycle') {
    $cycleId = (int)($_GET['cycle_id'] ?? 0);

    $stmt = $db->prepare('
        SELECT c.*, f.land_area, f.land_unit, f.soil_type, f.water_availability, f.weather_condition,
               h.id AS harvest_id, h.actual_harvest_date, h.actual_quantity, h.quantity_unit,
               h.crop_condition, h.visible_damage, h.intended_storage_duration, h.storage_facility, h.intended_market,
               p.spoilage_risk_level, p.spoilage_risk_score, p.storage_recommendations, p.grading_summary, p.transportation_guidance, p.market_selling_guidance
        FROM crop_cycles c
        JOIN farms f ON c.farm_id = f.id
        LEFT JOIN harvest_records h ON c.id = h.cycle_id
        LEFT JOIN post_harvest_assessments p ON c.id = p.cycle_id
        WHERE c.id = ? AND c.user_id = ?
    ');
    $stmt->execute([$cycleId, $userId]);
    $cycle = $stmt->fetch();

    if (!$cycle) {
        jsonResponse(['success' => false, 'message' => 'Crop cycle record not found or access denied.'], 404);
    }

    // Decode JSON strings if present
    if (!empty($cycle['storage_recommendations'])) {
        $cycle['storage_recommendations'] = json_decode($cycle['storage_recommendations'], true);
    }
    if (!empty($cycle['grading_summary'])) {
        $cycle['grading_summary'] = json_decode($cycle['grading_summary'], true);
    }
    if (!empty($cycle['transportation_guidance'])) {
        $cycle['transportation_guidance'] = json_decode($cycle['transportation_guidance'], true);
    }
    if (!empty($cycle['market_selling_guidance'])) {
        $cycle['market_selling_guidance'] = json_decode($cycle['market_selling_guidance'], true);
    }

    jsonResponse(['success' => true, 'cycle' => $cycle]);
}

// 2. SUBMIT HARVEST & GENERATE COMPLETE POST-HARVEST ASSESSMENTS
if ($method === 'POST' && $action === 'submit_harvest') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;

    $cycleId = (int)($data['cycle_id'] ?? 0);
    $actualHarvestDate = trim($data['actual_harvest_date'] ?? date('Y-m-d'));
    $actualQuantity = (float)($data['actual_quantity'] ?? 0);
    $quantityUnit = trim($data['quantity_unit'] ?? 'Quintals');
    $cropCondition = trim($data['crop_condition'] ?? 'Good');
    $visibleDamage = trim($data['visible_damage'] ?? 'None');
    $intendedStorageDuration = trim($data['intended_storage_duration'] ?? '1-2 weeks');
    $storageFacility = trim($data['storage_facility'] ?? 'Well-ventilated room');
    $intendedMarket = trim($data['intended_market'] ?? 'Local Mandi');

    // Produce batches allocation
    $gradeAQty = (float)($data['grade_a_quantity'] ?? ($actualQuantity * 0.65));
    $gradeBQty = (float)($data['grade_b_quantity'] ?? ($actualQuantity * 0.25));
    $gradeCQty = (float)($data['grade_c_quantity'] ?? ($actualQuantity * 0.10));

    // Verify ownership
    $stmt = $db->prepare('SELECT * FROM crop_cycles WHERE id = ? AND user_id = ?');
    $stmt->execute([$cycleId, $userId]);
    $cycle = $stmt->fetch();

    if (!$cycle) {
        jsonResponse(['success' => false, 'message' => 'Crop cycle not found or unauthorized.'], 403);
    }

    $cropName = $cycle['crop_name'];

    // Calculate Spoilage Risk
    $spoilageScore = 20;
    $spoilageReasons = [];
    $spoilageActions = [];

    $isHighPerishable = stripos($cropName, 'tomato') !== false || stripos($cropName, 'fruit') !== false;

    if ($isHighPerishable) {
        $spoilageScore += 30;
        $spoilageReasons[] = "$cropName has high moisture content and high respiration rate.";
    }

    if ($visibleDamage === 'Severe') {
        $spoilageScore += 35;
        $spoilageReasons[] = "Severe visible skin cuts expose produce to mold and bacterial breakdown.";
        $spoilageActions[] = "Quarantine damaged units immediately to prevent contamination of healthy produce.";
    } elseif ($visibleDamage === 'Moisture damage') {
        $spoilageScore += 25;
        $spoilageReasons[] = "Trapped surface moisture elevates bacterial soft rot risks.";
        $spoilageActions[] = "Dry produce on shaded raised mesh racks prior to bulk packing.";
    }

    if ($storageFacility === 'Open shed' && ($intendedStorageDuration === '1-3 months' || $intendedStorageDuration === '3-6 months')) {
        $spoilageScore += 30;
        $spoilageReasons[] = "Open ambient holding cannot sustain extended storage without severe weight and quality loss.";
        $spoilageActions[] = "Shift produce to an authorized cold chain or humidity-controlled warehouse.";
    } elseif ($storageFacility === 'Cold storage') {
        $spoilageScore -= 20;
        $spoilageReasons[] = "Temperature management retards senescence and microflora proliferation.";
    }

    $spoilageScore = max(10, min(95, $spoilageScore));
    $riskLevel = $spoilageScore >= 60 ? 'High' : ($spoilageScore >= 35 ? 'Moderate' : 'Low');

    if (empty($spoilageActions)) {
        $spoilageActions[] = "Inspect batches every 48 hours for early signs of softening or condensation.";
        $spoilageActions[] = "Maintain pallet spacing of 45cm from warehouse walls for unimpeded air circulation.";
    }

    // Storage recommendations
    $storageRec = [
        'method' => $isHighPerishable ? 'Perforated plastic crates at 10°C - 13°C and 85-90% RH' : 'Stack 50kg hermetic bags on wooden pallets in dry godown',
        'temperature' => $isHighPerishable ? '10°C - 13°C' : '18°C - 24°C',
        'humidity' => $isHighPerishable ? '85% - 90%' : '55% - 65%',
        'ventilation' => 'Allow cross-breeze during dawn and dusk; avoid damp rainy winds.',
        'packaging' => $isHighPerishable ? 'Ventilated food-grade plastic crates (15-20kg capacity)' : 'Triple-layer hermetic or jute gunny bags',
        'shelfLife' => $isHighPerishable ? ($storageFacility === 'Cold storage' ? '2-3 weeks' : '4-6 days') : '6-12 months',
        'spoilageFactors' => [
            'Excessive condensation inside closed containers.',
            'Warm ambient temperatures accelerating ripening enzymes.',
            'Direct sun exposure causing moisture evaporation and wrinkling.'
        ]
    ];

    // Grading summary
    $gradingSummary = [
        'gradeA' => ['name' => 'Grade A (Premium)', 'quantity' => $gradeAQty, 'unit' => $quantityUnit, 'desc' => 'Superior size, uniform coloration, zero blemishes. Best for urban retail & export.'],
        'gradeB' => ['name' => 'Grade B (Standard)', 'quantity' => $gradeBQty, 'unit' => $quantityUnit, 'desc' => 'Good market quality, slight shape variation. Suitable for wholesale APMC auction.'],
        'gradeC' => ['name' => 'Grade C (Processing)', 'quantity' => $gradeCQty, 'unit' => $quantityUnit, 'desc' => 'Small or minor cosmetic scuffs. Recommended for local canning or puree.'],
    ];

    // Transport suggestions
    $transportGuidance = [
        'vehicleType' => $isHighPerishable ? 'Insulated/Refrigerated Reefer or Shaded Pickup Truck' : 'Covered Tarpaulin Lorry or Tractor Trolley',
        'packingGuidance' => 'Interlocking crate arrangement with corner edge protectors to minimize transit shock vibration.',
        'dispatchUrgency' => $isHighPerishable ? 'Immediate (Within 12-24 hours of harvest)' : 'Scheduled bulk transit within 5-7 days'
    ];

    // Market selling guidance
    $basePrice = stripos($cropName, 'tomato') !== false ? 1800 : (stripos($cropName, 'rice') !== false ? 2200 : 2500);
    $marketGuidance = [
        'benchmarkPrices' => [
            'gradeA' => round($basePrice * 1.25),
            'gradeB' => round($basePrice * 1.0),
            'gradeC' => round($basePrice * 0.60),
            'currency' => 'INR',
            'unit' => 'per Quintal'
        ],
        'mandiRecommendation' => 'Nearest APMC Yard or Direct Supermarket Collection Centre',
        'optimalSellingWindow' => $riskLevel === 'High' ? 'Sell immediately in next morning auction' : 'Hold up to 1-2 weeks if prices are trending upwards'
    ];

    $db->beginTransaction();
    try {
        // Insert or update harvest record
        $hStmt = $db->prepare('
            INSERT INTO harvest_records (cycle_id, user_id, actual_harvest_date, actual_quantity, quantity_unit, crop_condition, visible_damage, intended_storage_duration, storage_facility, intended_market)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            actual_harvest_date = VALUES(actual_harvest_date),
            actual_quantity = VALUES(actual_quantity),
            quantity_unit = VALUES(quantity_unit),
            crop_condition = VALUES(crop_condition),
            visible_damage = VALUES(visible_damage),
            intended_storage_duration = VALUES(intended_storage_duration),
            storage_facility = VALUES(storage_facility),
            intended_market = VALUES(intended_market)
        ');
        $hStmt->execute([
            $cycleId,
            $userId,
            $actualHarvestDate,
            $actualQuantity,
            $quantityUnit,
            $cropCondition,
            $visibleDamage,
            $intendedStorageDuration,
            $storageFacility,
            $intendedMarket
        ]);
        $harvestId = (int)$db->lastInsertId();
        if ($harvestId === 0) {
            $hGet = $db->prepare('SELECT id FROM harvest_records WHERE cycle_id = ?');
            $hGet->execute([$cycleId]);
            $harvestId = (int)$hGet->fetchColumn();
        }

        // Produce batches
        $db->prepare('DELETE FROM produce_batches WHERE harvest_id = ?')->execute([$harvestId]);
        $batchStmt = $db->prepare('INSERT INTO produce_batches (harvest_id, grade_name, quantity, unit) VALUES (?, ?, ?, ?)');
        $batchStmt->execute([$harvestId, 'Grade A', $gradeAQty, $quantityUnit]);
        $batchStmt->execute([$harvestId, 'Grade B', $gradeBQty, $quantityUnit]);
        $batchStmt->execute([$harvestId, 'Grade C', $gradeCQty, $quantityUnit]);

        // Post-Harvest Assessment
        $db->prepare('DELETE FROM post_harvest_assessments WHERE cycle_id = ?')->execute([$cycleId]);
        $assStmt = $db->prepare('
            INSERT INTO post_harvest_assessments (cycle_id, user_id, harvest_id, grading_summary, storage_recommendations, spoilage_risk_level, spoilage_risk_score, spoilage_reasons, spoilage_actions, transportation_guidance, market_selling_guidance)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        $assStmt->execute([
            $cycleId,
            $userId,
            $harvestId,
            json_encode($gradingSummary, JSON_UNESCAPED_UNICODE),
            json_encode($storageRec, JSON_UNESCAPED_UNICODE),
            $riskLevel,
            $spoilageScore,
            json_encode($spoilageReasons, JSON_UNESCAPED_UNICODE),
            json_encode($spoilageActions, JSON_UNESCAPED_UNICODE),
            json_encode($transportGuidance, JSON_UNESCAPED_UNICODE),
            json_encode($marketGuidance, JSON_UNESCAPED_UNICODE)
        ]);

        // Update crop cycle status to 'harvested'
        $db->prepare('UPDATE crop_cycles SET status = "harvested" WHERE id = ?')->execute([$cycleId]);

        $db->commit();

        jsonResponse([
            'success' => true,
            'message' => 'Harvest logged and Post-Harvest assessment successfully generated!',
            'cycleId' => $cycleId,
            'assessment' => [
                'cropName' => $cropName,
                'spoilageRiskLevel' => $riskLevel,
                'spoilageScore' => $spoilageScore,
                'reasons' => $spoilageReasons,
                'actions' => $spoilageActions,
                'storageRecommendations' => $storageRec,
                'gradingSummary' => $gradingSummary,
                'transportationGuidance' => $transportGuidance,
                'marketSellingGuidance' => $marketGuidance
            ]
        ]);
    } catch (Exception $e) {
        $db->rollBack();
        jsonResponse(['success' => false, 'message' => 'Error saving harvest assessment: ' . $e->getMessage()], 500);
    }
}

jsonResponse(['success' => false, 'message' => 'Invalid action.'], 404);
