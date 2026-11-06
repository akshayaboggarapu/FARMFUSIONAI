<?php
/**
 * FarmFusion AI — Configuration & Database Connection
 * Tagline: Smart Farming, Better Harvest, Less Waste.
 */

// Start secure session if not active
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// --------------------------------------------------------------------------
// Database Credentials (Update with your local MySQL setup e.g. XAMPP/WAMP)
// --------------------------------------------------------------------------
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_PORT', getenv('DB_PORT') ?: '3306');
define('DB_NAME', getenv('DB_NAME') ?: 'farmfusion_ai');
define('DB_USER', getenv('DB_USER') ?: 'root');
define('DB_PASS', getenv('DB_PASS') ?: '');

// --------------------------------------------------------------------------
// Optional AI API Configuration (Gemini or OpenAI compatible)
// Never exposed in frontend JavaScript!
// --------------------------------------------------------------------------
define('GEMINI_API_KEY', getenv('GEMINI_API_KEY') ?: '');
define('AI_API_ENABLED', !empty(GEMINI_API_KEY));

/**
 * Get PDO Database Connection
 * @return PDO
 */
function getDbConnection() {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Database connection failed: ' . $e->getMessage()
            ]);
            exit;
        }
    }
    return $pdo;
}

/**
 * Standard JSON response helper
 */
function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Require authenticated farmer session
 * Prevents unauthorized access or cross-farmer data tampering
 */
function requireAuth() {
    if (!isset($_SESSION['user_id'])) {
        jsonResponse([
            'success' => false,
            'message' => 'Unauthorized. Please login to continue.'
        ], 401);
    }
    return (int)$_SESSION['user_id'];
}
