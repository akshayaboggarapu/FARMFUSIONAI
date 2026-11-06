/**
 * FarmFusion AI — Server & Application Runtime
 * Full-stack Express server integrating persistent SQLite storage (mirroring database.sql),
 * Gemini AI recommendation engine via @google/genai, deterministic agronomy fallback,
 * and Vite middleware for the Vanilla HTML5/CSS/JS frontend.
 */

import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { DatabaseSync } from 'node:sqlite';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  calculateCropSuitability,
  calculateSpoilageRisk,
  getCropGradingCriteria,
  getCropStorageGuidance,
  getTransportationGuidance,
  getMarketSellingGuidance,
  PreHarvestInputs,
  PostHarvestInputs,
} from './src/utils/agronomy.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite database matching MySQL schema
const db = new DatabaseSync(path.join(__dirname, 'farmfusion.db'));

// Enable Foreign Keys
db.exec('PRAGMA foreign_keys = ON;');

// Create tables identical to database.sql
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mobile TEXT NOT NULL UNIQUE,
    email TEXT,
    password_hash TEXT NOT NULL,
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    village TEXT NOT NULL,
    preferred_language TEXT DEFAULT 'en',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS farms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    farm_name TEXT DEFAULT 'Primary Farmland',
    land_area REAL NOT NULL,
    land_unit TEXT NOT NULL DEFAULT 'acres',
    soil_type TEXT NOT NULL,
    soil_fertility TEXT NOT NULL,
    soil_ph REAL,
    nitrogen_val REAL,
    phosphorus_val REAL,
    potassium_val REAL,
    water_availability TEXT NOT NULL,
    weather_condition TEXT,
    cultivation_budget REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS crop_cycles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_code TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    farm_id INTEGER NOT NULL,
    crop_name TEXT NOT NULL,
    crop_key TEXT NOT NULL,
    crop_variety TEXT,
    season TEXT NOT NULL,
    previous_crop TEXT,
    sowing_date TEXT,
    suitability_score INTEGER DEFAULT 85,
    status TEXT DEFAULT 'cultivating', -- 'cultivating', 'harvested', 'completed'
    selected_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS crop_recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    cycle_id INTEGER,
    crop_name TEXT NOT NULL,
    crop_key TEXT NOT NULL,
    suitability_score INTEGER NOT NULL,
    soil_suitability TEXT NOT NULL,
    weather_suitability TEXT NOT NULL,
    water_requirement TEXT NOT NULL,
    expected_duration TEXT NOT NULL,
    recommended_sowing TEXT NOT NULL,
    estimated_yield TEXT NOT NULL,
    explanation TEXT NOT NULL,
    is_ai_generated INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (cycle_id) REFERENCES crop_cycles(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS harvest_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_id INTEGER NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    actual_harvest_date TEXT NOT NULL,
    actual_quantity REAL NOT NULL,
    quantity_unit TEXT NOT NULL DEFAULT 'Quintals',
    crop_condition TEXT NOT NULL,
    visible_damage TEXT NOT NULL,
    intended_storage_duration TEXT NOT NULL,
    storage_facility TEXT NOT NULL,
    intended_market TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cycle_id) REFERENCES crop_cycles(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS produce_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    harvest_id INTEGER NOT NULL,
    grade_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    unit_price_estimate REAL,
    quality_notes TEXT,
    FOREIGN KEY (harvest_id) REFERENCES harvest_records(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS post_harvest_assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    harvest_id INTEGER NOT NULL,
    grading_summary TEXT,
    storage_recommendations TEXT NOT NULL,
    spoilage_risk_level TEXT NOT NULL,
    spoilage_risk_score INTEGER NOT NULL,
    spoilage_reasons TEXT NOT NULL,
    spoilage_actions TEXT NOT NULL,
    transportation_guidance TEXT NOT NULL,
    market_selling_guidance TEXT NOT NULL,
    assessment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cycle_id) REFERENCES crop_cycles(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (harvest_id) REFERENCES harvest_records(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Pre-seed Demo Farmer: Ramesh Kumar (9876543210 / Farmer@123)
const passwordHash = crypto.createHash('sha256').update('Farmer@123').digest('hex');
const userExists = db.prepare('SELECT id FROM users WHERE mobile = ?').get('9876543210');
if (!userExists) {
  db.prepare(`
    INSERT INTO users (name, mobile, email, password_hash, state, district, village, preferred_language)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Ramesh Kumar',
    '9876543210',
    'ramesh@farmfusion.demo',
    passwordHash,
    'Telangana',
    'Warangal',
    'Narsampet',
    'en'
  );

  const demoUserId = 1;
  db.prepare(`
    INSERT INTO farms (id, user_id, farm_name, land_area, land_unit, soil_type, soil_fertility, soil_ph, water_availability, weather_condition)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    1,
    demoUserId,
    'Kisan Green Acres',
    3.5,
    'acres',
    'Black',
    'High',
    6.8,
    'Borewell',
    'Sunny'
  );

  db.prepare(`
    INSERT INTO crop_cycles (id, cycle_code, user_id, farm_id, crop_name, crop_key, crop_variety, season, previous_crop, sowing_date, suitability_score, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    1,
    'CYC-84721',
    demoUserId,
    1,
    'Tomato',
    'tomato',
    'Arka Rakshak (High Yield F1)',
    'Kharif',
    'Pulses (Green Gram)',
    '2026-06-15',
    94,
    'cultivating'
  );
}

// Persistent session management via SQLite
function generateSessionToken(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  db.prepare('INSERT OR REPLACE INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  return token;
}

function getUserIdFromToken(token: string | undefined): number | null {
  if (!token) return null;
  const session = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token) as any;
  if (!session) return null;
  if (session.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return session.user_id;
}

function extractToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const t = authHeader.substring(7).trim();
    if (t) return t;
  }
  const xToken = req.headers['x-farmfusion-token'];
  if (typeof xToken === 'string' && xToken.trim()) {
    return xToken.trim();
  }
  if (typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }
  if (req.cookies?.ff_session) {
    return req.cookies.ff_session;
  }
  return undefined;
}

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  const userId = getUserIdFromToken(token);
  if (userId) {
    (req as any).userId = userId;
    return next();
  }
  return res.status(401).json({ success: false, message: 'Unauthorized. Please login.' });
}

// Optional Auth: if authenticated sets req.userId, else continues
function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  const userId = getUserIdFromToken(token);
  if (userId) {
    (req as any).userId = userId;
  }
  next();
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // URL normalizers for clean extensionless navigation
  app.get('/dashboard', (req: Request, res: Response) => {
    const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    res.redirect(302, '/dashboard.html' + qs);
  });
  app.get('/login', (req: Request, res: Response) => {
    const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    res.redirect(302, '/login.html' + qs);
  });
  app.get('/register', (req: Request, res: Response) => {
    const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    res.redirect(302, '/register.html' + qs);
  });
  app.get('/pre-harvest', (req: Request, res: Response) => {
    const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    res.redirect(302, '/pre-harvest.html' + qs);
  });
  app.get('/post-harvest', (req: Request, res: Response) => {
    const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    res.redirect(302, '/post-harvest.html' + qs);
  });

  // --------------------------------------------------------------------------
  // API: Authentication
  // --------------------------------------------------------------------------
  app.post('/api/auth/register', (req: Request, res: Response) => {
    try {
      const { name, mobile, email, password, state, district, village, preferred_language } = req.body;

      if (!name || !mobile || !password || !state || !district || !village) {
        return res.status(400).json({ success: false, message: 'Please complete all required fields.' });
      }

      const existing = db.prepare('SELECT id FROM users WHERE mobile = ?').get(mobile);
      if (existing) {
        return res.status(409).json({ success: false, message: 'A farmer is already registered with this mobile number.' });
      }

      const hash = crypto.createHash('sha256').update(password).digest('hex');
      const lang = preferred_language || 'en';

      const result = db.prepare(`
        INSERT INTO users (name, mobile, email, password_hash, state, district, village, preferred_language)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(name, mobile, email || null, hash, state, district, village, lang);

      const userId = Number(result.lastInsertRowid);
      const token = generateSessionToken(userId);

      res.cookie('ff_session', token, { httpOnly: false, maxAge: 7 * 86400 * 1000, sameSite: 'none', secure: true });
      return res.status(201).json({
        success: true,
        message: 'Registration successful! Welcome to FarmFusion AI.',
        token,
        user: { id: userId, name, mobile, email, state, district, village, preferred_language: lang },
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    try {
      const { identifier, mobile, password } = req.body;
      const target = identifier || mobile;

      if (!target || !password) {
        return res.status(400).json({ success: false, message: 'Please provide mobile/email and password.' });
      }

      const hash = crypto.createHash('sha256').update(password).digest('hex');
      const user = db.prepare('SELECT * FROM users WHERE mobile = ? OR email = ?').get(target, target) as any;

      if (!user || user.password_hash !== hash) {
        return res.status(401).json({ success: false, message: 'Invalid mobile number/email or password.' });
      }

      const token = generateSessionToken(user.id);
      res.cookie('ff_session', token, { httpOnly: false, maxAge: 7 * 86400 * 1000, sameSite: 'none', secure: true });

      return res.json({
        success: true,
        message: 'Login Successful! Welcome to FarmFusion AI.',
        token,
        user: {
          id: user.id,
          name: user.name,
          mobile: user.mobile,
          email: user.email,
          state: user.state,
          district: user.district,
          village: user.village,
          preferred_language: user.preferred_language || 'en',
        },
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token = extractToken(req);
    if (token) {
      try {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      } catch (e) {}
    }
    res.clearCookie('ff_session');
    return res.json({ success: true, message: 'Logged out successfully.' });
  });

  app.get('/api/auth/session', optionalAuthMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).userId;
    if (!userId) {
      return res.json({ success: true, authenticated: false, user: null });
    }
    const user = db.prepare('SELECT id, name, mobile, email, state, district, village, preferred_language FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      return res.json({ success: true, authenticated: false, user: null });
    }
    return res.json({ success: true, authenticated: true, user });
  });

  app.post('/api/auth/language', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const { language } = req.body;
    if (['en', 'te', 'hi'].includes(language)) {
      db.prepare('UPDATE users SET preferred_language = ? WHERE id = ?').run(language, userId);
      return res.json({ success: true, language });
    }
    return res.status(400).json({ success: false, message: 'Unsupported language.' });
  });

  // --------------------------------------------------------------------------
  // API: Pre-Harvest Recommendations
  // --------------------------------------------------------------------------
  app.post('/api/recommendations/generate', authMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const inputs: PreHarvestInputs = req.body;

      let recommendations: any[] = [];
      let isAiGenerated = false;

      // Check if Gemini API is available
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (geminiApiKey && geminiApiKey !== 'MY_GEMINI_API_KEY') {
        try {
          const ai = new GoogleGenAI();
          const prompt = `You are FarmFusion AI, a senior agronomy expert.
Farmer's Land & Environment Conditions:
- Location: ${inputs.state}, ${inputs.district}, Village: ${inputs.village || 'Local'}
- Farm Size: ${inputs.landArea} ${inputs.landUnit}
- Soil: ${inputs.soilType} (${inputs.soilFertility} fertility, pH: ${inputs.soilPh || 'Not specified'}, NPK: N=${inputs.nitrogen || 'N/A'}, P=${inputs.phosphorus || 'N/A'}, K=${inputs.potassium || 'N/A'})
- Season: ${inputs.season}
- Water / Irrigation: ${inputs.waterAvailability}
- Previous Crop: ${inputs.previousCrop || 'None / Fallow'}
- Weather: ${inputs.weatherCondition || 'Normal seasonal climate'}
- Budget: ${inputs.cultivationBudget ? '₹' + inputs.cultivationBudget : 'Standard'}

Return exactly 3 highly suitable agricultural crops in valid JSON matching this schema:
An array of objects each having:
- cropName: string (e.g. "Tomato" or "Rice (Paddy)")
- cropKey: string (lowercase key e.g. "tomato", "rice", "cotton", "chilli", "groundnut", "maize", "pulses", "wheat", "onion")
- imageUrl: string (valid public unsplash agricultural image)
- suitabilityScore: integer (75 to 98)
- soilSuitability: string (why soil is suitable)
- weatherSeasonSuitability: string (why season/climate matches)
- waterRequirement: string
- expectedDuration: string (e.g. "90 - 110 days")
- recommendedSowingPeriod: string
- estimatedYieldRange: string (e.g. "20 - 28 Quintals/Acre")
- explanation: string (clear agronomic rationale)
`;

          const geminiPromise = ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    cropName: { type: Type.STRING },
                    cropKey: { type: Type.STRING },
                    imageUrl: { type: Type.STRING },
                    suitabilityScore: { type: Type.INTEGER },
                    soilSuitability: { type: Type.STRING },
                    weatherSeasonSuitability: { type: Type.STRING },
                    waterRequirement: { type: Type.STRING },
                    expectedDuration: { type: Type.STRING },
                    recommendedSowingPeriod: { type: Type.STRING },
                    estimatedYieldRange: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                  },
                  required: [
                    'cropName',
                    'cropKey',
                    'suitabilityScore',
                    'soilSuitability',
                    'weatherSeasonSuitability',
                    'waterRequirement',
                    'expectedDuration',
                    'recommendedSowingPeriod',
                    'estimatedYieldRange',
                    'explanation',
                  ],
                },
              },
            },
          });

          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Gemini API call timed out after 5000ms')), 5000)
          );

          const response = await Promise.race([geminiPromise, timeoutPromise]);

          if (response.text) {
            const parsed = JSON.parse(response.text);
            if (Array.isArray(parsed) && parsed.length > 0) {
              recommendations = parsed.map((item) => ({ ...item, isRuleBased: false }));
              isAiGenerated = true;
            }
          }
        } catch (aiErr) {
          console.warn('Gemini API call fell back to deterministic agronomy model:', aiErr);
        }
      }

      // If AI was not configured or threw, use our tested agronomy model
      if (recommendations.length === 0) {
        recommendations = calculateCropSuitability(inputs);
        isAiGenerated = false;
      }

      // Record recommendation history in SQLite
      const insertRec = db.prepare(`
        INSERT INTO crop_recommendations (user_id, crop_name, crop_key, suitability_score, soil_suitability, weather_suitability, water_requirement, expected_duration, recommended_sowing, estimated_yield, explanation, is_ai_generated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const rec of recommendations) {
        insertRec.run(
          userId,
          rec.cropName,
          rec.cropKey || 'general',
          rec.suitabilityScore,
          rec.soilSuitability,
          rec.weatherSeasonSuitability,
          rec.waterRequirement,
          rec.expectedDuration,
          rec.recommendedSowingPeriod,
          rec.estimatedYieldRange,
          rec.explanation,
          isAiGenerated ? 1 : 0
        );
      }

      return res.json({
        success: true,
        isAiGenerated,
        engineLabel: isAiGenerated ? 'FarmFusion AI Intelligent Model' : 'Deterministic Agronomy Rule-Based Engine',
        recommendations,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // API: Select Crop Cycle (The Crucial Pre-to-Post-Harvest Bridge)
  // --------------------------------------------------------------------------
  app.post('/api/crops/select', authMiddleware, (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const {
        crop_name,
        crop_key,
        crop_variety,
        land_area,
        land_unit,
        soil_type,
        soil_fertility,
        soil_ph,
        water_availability,
        weather_condition,
        season,
        previous_crop,
        sowing_date,
        suitability_score,
      } = req.body;

      if (!crop_name) {
        return res.status(400).json({ success: false, message: 'Crop name is required.' });
      }

      // 1. Insert farm record
      const farmRes = db.prepare(`
        INSERT INTO farms (user_id, farm_name, land_area, land_unit, soil_type, soil_fertility, soil_ph, water_availability, weather_condition)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        `Farmland - ${crop_name}`,
        Number(land_area) || 1,
        land_unit || 'acres',
        soil_type || 'Alluvial',
        soil_fertility || 'Medium',
        soil_ph ? Number(soil_ph) : null,
        water_availability || 'Borewell',
        weather_condition || 'Sunny'
      );
      const farmId = Number(farmRes.lastInsertRowid);

      // 2. Generate unique cycle code e.g. CYC-73821
      const cycleCode = 'CYC-' + Math.floor(10000 + Math.random() * 90000);
      const cKey = crop_key || crop_name.toLowerCase().replace(/[^a-z0-9]/g, '');

      // 3. Insert crop cycle
      const cycleRes = db.prepare(`
        INSERT INTO crop_cycles (cycle_code, user_id, farm_id, crop_name, crop_key, crop_variety, season, previous_crop, sowing_date, suitability_score, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cycleCode,
        userId,
        farmId,
        crop_name,
        cKey,
        crop_variety || 'High Yield Selected Variety',
        season || 'Kharif',
        previous_crop || 'None',
        sowing_date || new Date().toISOString().split('T')[0],
        Number(suitability_score) || 88,
        'cultivating'
      );
      const cycleId = Number(cycleRes.lastInsertRowid);

      return res.status(201).json({
        success: true,
        message: 'Crop Selected Successfully! Your crop details are saved and connected to Post-Harvest.',
        cycleId,
        cycleCode,
        cropName: crop_name,
        status: 'cultivating',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // Get farmer's saved crop cycles
  app.get('/api/crops/my', authMiddleware, (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const crops = db.prepare(`
        SELECT c.*, f.land_area, f.land_unit, f.soil_type, f.water_availability,
               h.id AS harvest_id, h.actual_harvest_date, h.actual_quantity, h.quantity_unit,
               p.spoilage_risk_level
        FROM crop_cycles c
        JOIN farms f ON c.farm_id = f.id
        LEFT JOIN harvest_records h ON c.id = h.cycle_id
        LEFT JOIN post_harvest_assessments p ON c.id = p.cycle_id
        WHERE c.user_id = ?
        ORDER BY c.selected_date DESC
      `).all(userId);

      return res.json({ success: true, crops });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // Get details for a specific crop cycle
  app.get('/api/crops/:id', authMiddleware, (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const cycleId = parseInt(req.params.id, 10);

      const cycle = db.prepare(`
        SELECT c.*, f.land_area, f.land_unit, f.soil_type, f.soil_fertility, f.soil_ph, f.water_availability, f.weather_condition,
               h.id AS harvest_id, h.actual_harvest_date, h.actual_quantity, h.quantity_unit,
               h.crop_condition, h.visible_damage, h.intended_storage_duration, h.storage_facility, h.intended_market,
               p.id AS assessment_id, p.spoilage_risk_level, p.spoilage_risk_score, p.storage_recommendations,
               p.grading_summary, p.spoilage_reasons, p.spoilage_actions, p.transportation_guidance, p.market_selling_guidance
        FROM crop_cycles c
        JOIN farms f ON c.farm_id = f.id
        LEFT JOIN harvest_records h ON c.id = h.cycle_id
        LEFT JOIN post_harvest_assessments p ON c.id = p.cycle_id
        WHERE c.id = ? AND c.user_id = ?
      `).get(cycleId, userId) as any;

      if (!cycle) {
        return res.status(404).json({ success: false, message: 'Crop cycle not found or unauthorized.' });
      }

      // Parse JSON fields
      if (cycle.storage_recommendations) cycle.storage_recommendations = JSON.parse(cycle.storage_recommendations);
      if (cycle.grading_summary) cycle.grading_summary = JSON.parse(cycle.grading_summary);
      if (cycle.spoilage_reasons) cycle.spoilage_reasons = JSON.parse(cycle.spoilage_reasons);
      if (cycle.spoilage_actions) cycle.spoilage_actions = JSON.parse(cycle.spoilage_actions);
      if (cycle.transportation_guidance) cycle.transportation_guidance = JSON.parse(cycle.transportation_guidance);
      if (cycle.market_selling_guidance) cycle.market_selling_guidance = JSON.parse(cycle.market_selling_guidance);

      // Also get produce batches if present
      let batches: any[] = [];
      if (cycle.harvest_id) {
        batches = db.prepare('SELECT * FROM produce_batches WHERE harvest_id = ?').all(cycle.harvest_id);
      }

      // Default grading criteria for this crop
      const gradingCriteria = getCropGradingCriteria(cycle.crop_name);

      return res.json({ success: true, cycle, batches, gradingCriteria });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // API: Post-Harvest Processing & Submission
  // --------------------------------------------------------------------------
  app.post('/api/harvest/submit', authMiddleware, (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const {
        cycle_id,
        actual_harvest_date,
        actual_quantity,
        quantity_unit,
        crop_condition,
        visible_damage,
        intended_storage_duration,
        storage_facility,
        intended_market,
        grade_a_quantity,
        grade_b_quantity,
        grade_c_quantity,
      } = req.body;

      const cycleId = Number(cycle_id);
      const cycle = db.prepare('SELECT * FROM crop_cycles WHERE id = ? AND user_id = ?').get(cycleId, userId) as any;

      if (!cycle) {
        return res.status(403).json({ success: false, message: 'Crop cycle not found or unauthorized.' });
      }

      const totalQty = Number(actual_quantity) || 0;
      const unit = quantity_unit || 'Quintals';

      // 1. Calculate Spoilage Risk using agronomy engine
      const postInputs: PostHarvestInputs = {
        cropName: cycle.crop_name,
        cropKey: cycle.crop_key,
        actualHarvestDate: actual_harvest_date || new Date().toISOString().split('T')[0],
        harvestQuantity: totalQty,
        quantityUnit: unit,
        cropCondition: crop_condition || 'Good',
        visibleDamage: visible_damage || 'None',
        intendedStorageDuration: intended_storage_duration || '1-2 weeks',
        storageFacility: storage_facility || 'Well-ventilated room',
        intendedMarket: intended_market || 'Local Mandi',
      };

      const spoilageAssessment = calculateSpoilageRisk(postInputs);
      const storageGuidance = getCropStorageGuidance(cycle.crop_name, postInputs.storageFacility);
      const transportGuidance = getTransportationGuidance(cycle.crop_name, totalQty, unit, postInputs.intendedMarket || 'Local Mandi');

      const gAQty = grade_a_quantity !== undefined ? Number(grade_a_quantity) : Math.round(totalQty * 0.65 * 10) / 10;
      const gBQty = grade_b_quantity !== undefined ? Number(grade_b_quantity) : Math.round(totalQty * 0.25 * 10) / 10;
      const gCQty = grade_c_quantity !== undefined ? Number(grade_c_quantity) : Math.round(totalQty * 0.10 * 10) / 10;

      const marketGuidance = getMarketSellingGuidance(cycle.crop_name, totalQty, {
        gradeA: gAQty,
        gradeB: gBQty,
        gradeC: gCQty,
      });

      const gradingSummary = {
        criteria: getCropGradingCriteria(cycle.crop_name),
        allocation: {
          gradeA: { name: 'Grade A', quantity: gAQty, unit },
          gradeB: { name: 'Grade B', quantity: gBQty, unit },
          gradeC: { name: 'Grade C', quantity: gCQty, unit },
        },
      };

      // 2. Insert or update harvest record
      const existingHarvest = db.prepare('SELECT id FROM harvest_records WHERE cycle_id = ?').get(cycleId) as any;
      let harvestId: number;

      if (existingHarvest) {
        harvestId = existingHarvest.id;
        db.prepare(`
          UPDATE harvest_records
          SET actual_harvest_date = ?, actual_quantity = ?, quantity_unit = ?, crop_condition = ?,
              visible_damage = ?, intended_storage_duration = ?, storage_facility = ?, intended_market = ?
          WHERE id = ?
        `).run(
          postInputs.actualHarvestDate,
          totalQty,
          unit,
          postInputs.cropCondition,
          postInputs.visibleDamage,
          postInputs.intendedStorageDuration,
          postInputs.storageFacility,
          postInputs.intendedMarket,
          harvestId
        );
      } else {
        const hRes = db.prepare(`
          INSERT INTO harvest_records (cycle_id, user_id, actual_harvest_date, actual_quantity, quantity_unit, crop_condition, visible_damage, intended_storage_duration, storage_facility, intended_market)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          cycleId,
          userId,
          postInputs.actualHarvestDate,
          totalQty,
          unit,
          postInputs.cropCondition,
          postInputs.visibleDamage,
          postInputs.intendedStorageDuration,
          postInputs.storageFacility,
          postInputs.intendedMarket
        );
        harvestId = Number(hRes.lastInsertRowid);
      }

      // 3. Insert produce batches
      db.prepare('DELETE FROM produce_batches WHERE harvest_id = ?').run(harvestId);
      const batchIns = db.prepare('INSERT INTO produce_batches (harvest_id, grade_name, quantity, unit, unit_price_estimate) VALUES (?, ?, ?, ?, ?)');
      batchIns.run(harvestId, 'Grade A', gAQty, unit, marketGuidance.benchmarkMandiPrices.gradeA.price);
      batchIns.run(harvestId, 'Grade B', gBQty, unit, marketGuidance.benchmarkMandiPrices.gradeB.price);
      batchIns.run(harvestId, 'Grade C', gCQty, unit, marketGuidance.benchmarkMandiPrices.gradeC.price);

      // 4. Insert or update post-harvest assessment
      db.prepare('DELETE FROM post_harvest_assessments WHERE cycle_id = ?').run(cycleId);
      db.prepare(`
        INSERT INTO post_harvest_assessments (cycle_id, user_id, harvest_id, grading_summary, storage_recommendations, spoilage_risk_level, spoilage_risk_score, spoilage_reasons, spoilage_actions, transportation_guidance, market_selling_guidance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cycleId,
        userId,
        harvestId,
        JSON.stringify(gradingSummary),
        JSON.stringify(storageGuidance),
        spoilageAssessment.riskLevel,
        spoilageAssessment.score,
        JSON.stringify(spoilageAssessment.reasons),
        JSON.stringify(spoilageAssessment.recommendedActions),
        JSON.stringify(transportGuidance),
        JSON.stringify(marketGuidance)
      );

      // 5. Update crop cycle status to 'harvested'
      db.prepare("UPDATE crop_cycles SET status = 'harvested' WHERE id = ?").run(cycleId);

      return res.json({
        success: true,
        message: 'Harvest recorded and comprehensive Post-Harvest assessment generated!',
        cycleId,
        harvestId,
        assessment: {
          cropName: cycle.crop_name,
          spoilageAssessment,
          storageGuidance,
          transportGuidance,
          marketGuidance,
          gradingSummary,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // Vite Integration (MPA & Dev Server)
  // --------------------------------------------------------------------------
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'mpa',
  });
  app.use(vite.middlewares);

  // Fallback for HTML routing
  app.use(express.static(path.resolve(__dirname)));

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌾 FarmFusion AI server listening on http://0.0.0.0:${PORT}`);
    import('node:child_process').then(({ exec }) => {
      exec(`start "" "http://localhost:${PORT}"`);
    });
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
