# FarmFusion AI — Smart Agriculture Website
> **Tagline:** Smart Farming, Better Harvest, Less Waste.  
> **Mission:** Connecting Pre-Harvest Crop Suitability Planning with Post-Harvest Quality Grading, Storage, Spoilage Prevention, and Market Intelligence through a Shared SQL Database.

---

## 🌾 Overview

**FarmFusion AI** is an agricultural decision-support web platform designed for Indian farmers. The application contains only two core, strongly-connected modules:

1. **Pre-Harvest Module:** Analyzes land area, soil type, fertility, soil pH, NPK nutrients, previous crop rotation, water availability, and season to recommend up to 3 highly suitable crops with transparent agronomy suitability scores and rationale. When a farmer selects a recommended crop, a unique crop-cycle ID (`CYC-XXXXX`) is generated and permanently saved to the SQL database.
2. **Post-Harvest Module:** Connects directly to the exact cultivated crop record from the shared SQL database. When farming is completed, the farmer enters minimal harvest details (harvest date, quantity, condition, damage, intended storage, and facility). The system then generates:
   - **Step 3: Crop-Specific Grading** (Grade A, Grade B, Grade C, and Manual Inspection)
   - **Step 4: Crop-Specific Storage Guidance** (Temperature, humidity, ventilation, packaging, shelf-life)
   - **Step 5: Spoilage-Risk Alerts** (Transparent Low, Moderate, or High risk calculation with identified causes and actionable prevention steps)
   - **Step 6: Transportation Suggestions** (Vehicle selection, packing, transit precautions, dispatch urgency)
   - **Step 7: Market & Selling Guidance** (Benchmark APMC Mandi rates, selling channels, optimal auction timing)

---

## 📁 Clean, Organized File Structure

```text
/
├── index.html                  # Landing page introducing FarmFusion AI and module overviews
├── login.html                  # Farmer login with demo credentials and session popup
├── register.html               # Farmer registration form with location and language preference
├── dashboard.html              # Authenticated farmer dashboard displaying active crop cycles
├── pre-harvest.html            # Pre-Harvest 12-field input form and crop suitability recommendations
├── post-harvest.html           # Post-Harvest module (Steps 1 to 7) connected to the exact crop cycle
├── style.css                   # Custom agricultural styling (Forest green, Leaf green, Earthy accents)
├── script.js                   # Client-side JavaScript controller & API caller
├── language.js                 # Multilingual dictionaries for English, Telugu (తెలుగు), and Hindi (हिन्दी)
├── config.php                  # PHP MySQL PDO connection, session setup & AI API configuration
├── database.sql                # Complete MySQL database creation script with 7 tables, FKs & demo seed
├── server.ts                   # Full-stack Node/Express backend with SQLite persistence matching database.sql
├── package.json                # Project dependencies and dev/start scripts
└── api/
    ├── auth.php                # PHP authentication endpoint (register, login, logout, session)
    ├── pre_harvest.php         # PHP Pre-Harvest endpoint (crop analysis & crop cycle selection)
    ├── post_harvest.php        # PHP Post-Harvest endpoint (harvest submission & assessments)
    └── ai_recommend.php        # PHP Google Gemini AI recommendation proxy
```

---

## 🗄️ Database Architecture (`database.sql`)

The database contains the 7 tables linked via relational foreign keys:

1. `users` — Farmer registration, credentials (hashed), location, and preferred language (`en`, `te`, `hi`).
2. `farms` — Land area, land unit, soil profile (type, fertility, pH, NPK), and water availability.
3. `crop_cycles` — Central relational link holding `cycle_code` (`CYC-XXXXX`), crop name, variety, season, sowing date, and status (`cultivating` or `harvested`).
4. `crop_recommendations` — Agronomic or AI crop suitability score and rationale history.
5. `harvest_records` — Actual harvest yield, condition, damage level, intended storage duration, and facility.
6. `produce_batches` — Quantities allocated to Grade A, Grade B, and Grade C.
7. `post_harvest_assessments` — Stored storage parameters, spoilage risk level & triggers, transportation guidance, and APMC benchmark market prices.

---

## 🚀 Setup & Execution Guide

### Option A: Local PHP & MySQL Stack (XAMPP / WAMP / LAMP / Docker)

#### 1. Install & Start Apache and MySQL
- Download and install **XAMPP** (or WAMP / MAMP).
- Start **Apache** and **MySQL** from the XAMPP Control Panel.
- Clone or copy this repository into your web root (e.g. `C:/xampp/htdocs/farmfusion/`).

#### 2. Import `database.sql`
- Open your browser and go to `http://localhost/phpmyadmin`.
- Click on **Import**.
- Choose the file `database.sql` from the project root.
- Click **Go**. This creates the `farmfusion_ai` database and all 7 tables with sample seed records.

#### 3. Configure Database Credentials
- Open `config.php` in a text editor.
- Verify or update your database settings:
  ```php
  define('DB_HOST', 'localhost');
  define('DB_PORT', '3306');
  define('DB_NAME', 'farmfusion_ai');
  define('DB_USER', 'root');
  define('DB_PASS', ''); // default empty in XAMPP
  ```

#### 4. Configure Optional AI API
- In `config.php`, provide your Google Gemini API key:
  ```php
  define('GEMINI_API_KEY', 'YOUR_GEMINI_API_KEY_HERE');
  ```
- If left empty, FarmFusion AI automatically uses its built-in deterministic agronomy rule-based engine.

#### 5. Open Website in Browser
- Navigate to: `http://localhost/farmfusion/index.html` (or `http://localhost/farmfusion/`).

---

### Option B: Node.js / Full-Stack Express Server (Pre-Configured Container)

This application is equipped with `server.ts` that provides the exact same endpoints, SQLite persistence (mirroring `database.sql`), and Gemini AI integration:

```bash
# 1. Install dependencies
npm install

# 2. Run unit tests
npm test # or: node --test src/utils/agronomy.test.ts

# 3. Start development server (Port 3000)
npm run dev
```

Open `http://localhost:3000` in your web browser.

---

## 🧪 Comprehensive Verification Checklist

### 1. Test Registration and Login
- Go to `login.html`.
- Click **"Autofill Demo Credentials"** to load the pre-seeded account (`9876543210` / `Farmer@123`).
- Click **Sign In**.
- Verify the required popup appears:  
  **“Login Successful! Welcome to FarmFusion AI.”**
- Click **OK**; you are redirected to `dashboard.html` showing the farmer's name ("Ramesh Kumar") and active crops.
- You can also test creating a new farmer via `register.html`.

### 2. Test Pre-Harvest Crop Recommendations
- Navigate to `pre-harvest.html`.
- Enter farm parameters (e.g., Land: 3.5 Acres, Soil: Black, Season: Kharif, Irrigation: Borewell, Previous Crop: Pulses).
- Click **"Analyze & Recommend Suitable Crops"**.
- Verify that up to 3 top recommendations (e.g., Tomato, Rice, Chilli/Cotton) are displayed with:
  - Crop image & name
  - Suitability score percentage (e.g. 92%)
  - Soil & weather suitability breakdown
  - Water requirement & duration
  - Estimated yield range
  - Clear agronomy rationale

### 3. Verify Strong Pre-to-Post-Harvest Connection
- On one of the recommended crops (e.g., **Tomato**), click **"Select This Crop"**.
- Verify confirmation popup:  
  **“Crop Selected Successfully! Your crop details are saved and connected to Post-Harvest.”**
- Click **“Farming Completed — Move to Post-Harvest”** or open `post-harvest.html`.
- Observe that the selected crop (**Tomato**, cycle code `CYC-XXXXX`, land area, soil type, and sowing date) is automatically retrieved from the database without asking you to re-type it.

### 4. Verify Post-Harvest Assessments (Steps 3 to 7)
- In `post-harvest.html`, fill in harvest details (e.g., Harvest Date: Today, Harvested: 45 Quintals, Condition: Good, Damage: None, Storage Duration: 1-2 weeks, Facility: Well-ventilated room).
- (Optional) Upload a crop sample photo for non-certified visual texture review.
- Click **"Generate Quality, Storage & Market Assessment"**.
- Verify:
  - **Step 5 (Spoilage Alert):** Risk level (Low / Moderate / High) with score, causes, and practical protective checklist.
  - **Step 3 (Grading):** Grade A, Grade B, Grade C breakdown with crop-specific defect criteria and allocated quantity.
  - **Step 4 (Storage):** Specific storage method, temperature range, humidity, packaging, and shelf-life.
  - **Step 6 (Transportation):** Recommended vehicle type, packing guidelines, and dispatch urgency.
  - **Step 7 (Market Guidance):** Benchmark APMC Mandi prices per grade and recommended selling channels.

### 5. Test Multilingual Support (English, Telugu, Hindi)
- Use the language selector in the navigation bar on any page (`English`, `తెలుగు`, `हिन्दी`).
- Verify that all navigation items, headings, form labels, buttons, validation alerts, and recommendations switch seamlessly across English, Telugu, and Hindi.
- Notice that the farmer's preferred language is stored in their database profile and restored on subsequent logins.

---

## 🛡️ Security & Quality Design
- **Password Security:** Server-side SHA-256 / `password_hash` with protected session cookies (`ff_session`).
- **Authorization:** Each farmer can only view and modify their own farm and harvest records. Cross-farmer data tampering is prevented.
- **AI Safety:** API keys are never exposed to frontend JavaScript. All AI interactions occur securely on the backend with deterministic agronomy fallbacks.
