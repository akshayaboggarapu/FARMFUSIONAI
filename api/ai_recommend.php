<?php
/**
 * FarmFusion AI — AI Recommendation Service (PHP)
 * Uses Google Gemini API (gemini-3.8-flash) via server-side cURL if key is present
 */

require_once __DIR__ . '/../config.php';

function getGeminiCropRecommendations($inputs) {
    $apiKey = GEMINI_API_KEY;
    if (empty($apiKey)) {
        return null;
    }

    $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=' . urlencode($apiKey);

    $prompt = "You are FarmFusion AI, a senior agricultural scientist and agronomist.
Given the farmer's land and seasonal conditions:
- State: {$inputs['state']}, District: {$inputs['district']}
- Land Area: {$inputs['land_area']} {$inputs['land_unit']}
- Soil Type: {$inputs['soil_type']}, Soil Fertility: {$inputs['soil_fertility']}
- Soil pH: " . ($inputs['soil_ph'] ?? 'Not specified') . "
- Season: {$inputs['season']}
- Irrigation / Water Availability: {$inputs['water_availability']}
- Previous Crop: " . ($inputs['previous_crop'] ?? 'Fallow') . "
- Weather: " . ($inputs['weather_condition'] ?? 'Normal') . "

Provide exactly 3 realistic, highly suitable crop recommendations in JSON format.
Each crop must contain:
- cropName (string, e.g. 'Tomato' or 'Rice (Paddy)')
- cropKey (string, lowercase identifier e.g. 'tomato', 'rice', 'cotton', 'chilli', 'groundnut')
- imageUrl (reliable Unsplash agricultural image URL)
- suitabilityScore (integer 75 to 98)
- soilSuitability (clear explanation of why this soil matches)
- weatherSeasonSuitability (explanation of why this season fits)
- waterRequirement (description of water need and irrigation fit)
- expectedDuration (e.g. '110 - 130 days')
- recommendedSowingPeriod (e.g. 'June - July')
- estimatedYieldRange (e.g. '20 - 25 Quintals/Acre')
- explanation (comprehensive agronomic reasoning)

Output ONLY valid raw JSON array of 3 objects with no markdown fences.";

    $postData = [
        'contents' => [
            [
                'parts' => [
                    ['text' => $prompt]
                ]
            ]
        ],
        'generationConfig' => [
            'responseMimeType' => 'application/json',
            'temperature' => 0.2
        ]
    ];

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($postData));
    curl_setopt($ch, CURLOPT_TIMEOUT, 12);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200 && $response) {
        $resObj = json_decode($response, true);
        $text = $resObj['candidates'][0]['content']['parts'][0]['text'] ?? '';
        $crops = json_decode($text, true);
        if (is_array($crops) && count($crops) > 0) {
            foreach ($crops as &$c) {
                $c['isRuleBased'] = false;
            }
            return $crops;
        }
    }

    return null;
}
