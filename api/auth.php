<?php
/**
 * FarmFusion AI — Authentication API (PHP/MySQL)
 * Handles Farmer Registration, Login, Session Check, and Logout.
 */

require_once __DIR__ . '/../config.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true) ?: $_POST;

    // 1. REGISTER
    if ($action === 'register') {
        $name = trim($input['name'] ?? '');
        $mobile = trim($input['mobile'] ?? '');
        $email = trim($input['email'] ?? '');
        $password = trim($input['password'] ?? '');
        $state = trim($input['state'] ?? '');
        $district = trim($input['district'] ?? '');
        $village = trim($input['village'] ?? '');
        $language = trim($input['preferred_language'] ?? 'en');

        // Validation
        if (empty($name) || empty($mobile) || empty($password) || empty($state) || empty($district) || empty($village)) {
            jsonResponse(['success' => false, 'message' => 'Please fill in all required registration fields.'], 400);
        }

        if (!preg_match('/^[0-9]{10}$/', $mobile)) {
            jsonResponse(['success' => false, 'message' => 'Please enter a valid 10-digit mobile number.'], 400);
        }

        if (strlen($password) < 6) {
            jsonResponse(['success' => false, 'message' => 'Password must be at least 6 characters long.'], 400);
        }

        $db = getDbConnection();

        // Check if mobile already exists
        $stmt = $db->prepare('SELECT id FROM users WHERE mobile = ?');
        $stmt->execute([$mobile]);
        if ($stmt->fetch()) {
            jsonResponse(['success' => false, 'message' => 'A farmer with this mobile number is already registered.'], 409);
        }

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);

        $insertStmt = $db->prepare(
            'INSERT INTO users (name, mobile, email, password_hash, state, district, village, preferred_language)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $insertStmt->execute([$name, $mobile, $email ?: null, $passwordHash, $state, $district, $village, $language]);
        $newUserId = (int)$db->lastInsertId();

        // Initialize session
        $_SESSION['user_id'] = $newUserId;
        $_SESSION['user_name'] = $name;
        $_SESSION['user_language'] = $language;
        $token = session_id();

        jsonResponse([
            'success' => true,
            'message' => 'Farmer registered successfully! Welcome to FarmFusion AI.',
            'token' => $token,
            'user' => [
                'id' => $newUserId,
                'name' => $name,
                'mobile' => $mobile,
                'email' => $email,
                'state' => $state,
                'district' => $district,
                'village' => $village,
                'preferred_language' => $language
            ]
        ], 201);
    }

    // 2. LOGIN
    if ($action === 'login') {
        $identifier = trim($input['identifier'] ?? $input['mobile'] ?? '');
        $password = trim($input['password'] ?? '');

        if (empty($identifier) || empty($password)) {
            jsonResponse(['success' => false, 'message' => 'Please provide your mobile number or email, and password.'], 400);
        }

        $db = getDbConnection();
        $stmt = $db->prepare('SELECT * FROM users WHERE mobile = ? OR email = ? LIMIT 1');
        $stmt->execute([$identifier, $identifier]);
        $user = $stmt->fetch();

        if (!$user) {
            jsonResponse(['success' => false, 'message' => 'Invalid credentials. Farmer record not found.'], 401);
        }

        // Support both password_verify and sha256 for demo compatibility
        $isPasswordValid = password_verify($password, $user['password_hash']) ||
            (hash('sha256', $password) === $user['password_hash']);

        if (!$isPasswordValid) {
            jsonResponse(['success' => false, 'message' => 'Invalid password. Please try again.'], 401);
        }

        // Establish Session
        $_SESSION['user_id'] = (int)$user['id'];
        $_SESSION['user_name'] = $user['name'];
        $_SESSION['user_language'] = $user['preferred_language'] ?: 'en';
        $token = session_id();

        jsonResponse([
            'success' => true,
            'message' => 'Login Successful! Welcome to FarmFusion AI.',
            'token' => $token,
            'user' => [
                'id' => (int)$user['id'],
                'name' => $user['name'],
                'mobile' => $user['mobile'],
                'email' => $user['email'],
                'state' => $user['state'],
                'district' => $user['district'],
                'village' => $user['village'],
                'preferred_language' => $user['preferred_language'] ?: 'en'
            ]
        ]);
    }

    // 3. LOGOUT
    if ($action === 'logout') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000,
                $params['path'], $params['domain'],
                $params['secure'], $params['httponly']
            );
        }
        session_destroy();
        jsonResponse(['success' => true, 'message' => 'Logged out successfully.']);
    }
}

// 4. GET CURRENT SESSION
if ($method === 'GET' && $action === 'session') {
    if (isset($_SESSION['user_id'])) {
        $db = getDbConnection();
        $stmt = $db->prepare('SELECT id, name, mobile, email, state, district, village, preferred_language FROM users WHERE id = ?');
        $stmt->execute([$_SESSION['user_id']]);
        $user = $stmt->fetch();

        if ($user) {
            jsonResponse(['success' => true, 'authenticated' => true, 'user' => $user]);
        }
    }
    jsonResponse(['success' => true, 'authenticated' => false, 'user' => null]);
}

jsonResponse(['success' => false, 'message' => 'Invalid action or method.'], 404);
