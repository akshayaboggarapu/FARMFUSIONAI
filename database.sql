-- ==============================================================================
-- FarmFusion AI — Smart Agriculture Database Schema
-- Compatible with MySQL 8.0+ / MariaDB 10.4+
-- Character Set: utf8mb4 / Collation: utf8mb4_unicode_ci
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS `farmfusion_ai` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `farmfusion_ai`;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `post_harvest_assessments`;
DROP TABLE IF EXISTS `produce_batches`;
DROP TABLE IF EXISTS `harvest_records`;
DROP TABLE IF EXISTS `crop_recommendations`;
DROP TABLE IF EXISTS `crop_cycles`;
DROP TABLE IF EXISTS `farms`;
DROP TABLE IF EXISTS `users`;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. Users Table (Farmers)
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `mobile` VARCHAR(20) NOT NULL UNIQUE,
  `email` VARCHAR(120) NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `state` VARCHAR(100) NOT NULL,
  `district` VARCHAR(100) NOT NULL,
  `village` VARCHAR(100) NOT NULL,
  `preferred_language` ENUM('en', 'te', 'hi') DEFAULT 'en',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_users_mobile` (`mobile`),
  INDEX `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Farms Table (Land & Agronomic Profile)
CREATE TABLE `farms` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `farm_name` VARCHAR(100) DEFAULT 'Primary Farmland',
  `land_area` DECIMAL(8,2) NOT NULL,
  `land_unit` VARCHAR(20) NOT NULL DEFAULT 'acres',
  `soil_type` VARCHAR(50) NOT NULL,
  `soil_fertility` VARCHAR(50) NOT NULL,
  `soil_ph` DECIMAL(4,2) NULL,
  `nitrogen_val` DECIMAL(6,2) NULL,
  `phosphorus_val` DECIMAL(6,2) NULL,
  `potassium_val` DECIMAL(6,2) NULL,
  `water_availability` VARCHAR(50) NOT NULL,
  `weather_condition` VARCHAR(100) NULL,
  `cultivation_budget` DECIMAL(12,2) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_farms_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Crop Cycles Table (Central Pre-to-Post-Harvest Link)
CREATE TABLE `crop_cycles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `cycle_code` VARCHAR(50) NOT NULL UNIQUE,
  `user_id` INT NOT NULL,
  `farm_id` INT NOT NULL,
  `crop_name` VARCHAR(100) NOT NULL,
  `crop_key` VARCHAR(50) NOT NULL,
  `crop_variety` VARCHAR(100) NULL,
  `season` VARCHAR(50) NOT NULL,
  `previous_crop` VARCHAR(100) NULL,
  `sowing_date` DATE NULL,
  `suitability_score` INT DEFAULT 85,
  `status` ENUM('cultivating', 'harvested', 'completed') DEFAULT 'cultivating',
  `selected_date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `notes` TEXT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON DELETE CASCADE,
  INDEX `idx_crop_cycles_user` (`user_id`),
  INDEX `idx_crop_cycles_code` (`cycle_code`),
  INDEX `idx_crop_cycles_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Crop Recommendations Table (Generated Pre-Harvest Suggestions)
CREATE TABLE `crop_recommendations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `cycle_id` INT NULL,
  `crop_name` VARCHAR(100) NOT NULL,
  `crop_key` VARCHAR(50) NOT NULL,
  `suitability_score` INT NOT NULL,
  `soil_suitability` TEXT NOT NULL,
  `weather_suitability` TEXT NOT NULL,
  `water_requirement` VARCHAR(100) NOT NULL,
  `expected_duration` VARCHAR(100) NOT NULL,
  `recommended_sowing` VARCHAR(100) NOT NULL,
  `estimated_yield` VARCHAR(100) NOT NULL,
  `explanation` TEXT NOT NULL,
  `is_ai_generated` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`cycle_id`) REFERENCES `crop_cycles`(`id`) ON DELETE SET NULL,
  INDEX `idx_crop_recommendations_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Harvest Records Table (Actual Yield Information)
CREATE TABLE `harvest_records` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `cycle_id` INT NOT NULL UNIQUE,
  `user_id` INT NOT NULL,
  `actual_harvest_date` DATE NOT NULL,
  `actual_quantity` DECIMAL(10,2) NOT NULL,
  `quantity_unit` VARCHAR(30) NOT NULL DEFAULT 'Quintals',
  `crop_condition` VARCHAR(50) NOT NULL,
  `visible_damage` VARCHAR(50) NOT NULL,
  `intended_storage_duration` VARCHAR(50) NOT NULL,
  `storage_facility` VARCHAR(80) NOT NULL,
  `intended_market` VARCHAR(100) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`cycle_id`) REFERENCES `crop_cycles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_harvest_records_user` (`user_id`),
  INDEX `idx_harvest_records_cycle` (`cycle_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Produce Batches Table (Grading Allocation)
CREATE TABLE `produce_batches` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `harvest_id` INT NOT NULL,
  `grade_name` VARCHAR(50) NOT NULL, -- Grade A, Grade B, Grade C, Needs Inspection
  `quantity` DECIMAL(10,2) NOT NULL,
  `unit` VARCHAR(30) NOT NULL,
  `unit_price_estimate` DECIMAL(10,2) NULL,
  `quality_notes` TEXT NULL,
  FOREIGN KEY (`harvest_id`) REFERENCES `harvest_records`(`id`) ON DELETE CASCADE,
  INDEX `idx_produce_batches_harvest` (`harvest_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Post-Harvest Assessments Table (Grading, Storage, Spoilage, Transport, Market)
CREATE TABLE `post_harvest_assessments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `cycle_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `harvest_id` INT NOT NULL,
  `grading_summary` LONGTEXT NULL,
  `storage_recommendations` LONGTEXT NOT NULL,
  `spoilage_risk_level` VARCHAR(20) NOT NULL,
  `spoilage_risk_score` INT NOT NULL,
  `spoilage_reasons` LONGTEXT NOT NULL,
  `spoilage_actions` LONGTEXT NOT NULL,
  `transportation_guidance` LONGTEXT NOT NULL,
  `market_selling_guidance` LONGTEXT NOT NULL,
  `assessment_date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`cycle_id`) REFERENCES `crop_cycles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`harvest_id`) REFERENCES `harvest_records`(`id`) ON DELETE CASCADE,
  INDEX `idx_post_harvest_cycle` (`cycle_id`),
  INDEX `idx_post_harvest_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- Demo Seed Data (Optional, for quick testing)
-- Password is 'Farmer@123' (SHA256 hashed: 8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918)
-- ==============================================================================

INSERT INTO `users` (`id`, `name`, `mobile`, `email`, `password_hash`, `state`, `district`, `village`, `preferred_language`)
VALUES (1, 'Ramesh Kumar', '9876543210', 'ramesh@farmfusion.demo', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', 'Telangana', 'Warangal', 'Narsampet', 'en')
ON DUPLICATE KEY UPDATE `id`=`id`;

INSERT INTO `farms` (`id`, `user_id`, `farm_name`, `land_area`, `land_unit`, `soil_type`, `soil_fertility`, `soil_ph`, `water_availability`, `weather_condition`)
VALUES (1, 1, 'Kisan Green Acres', 3.5, 'acres', 'Black', 'High', 6.8, 'Borewell', 'Sunny')
ON DUPLICATE KEY UPDATE `id`=`id`;

INSERT INTO `crop_cycles` (`id`, `cycle_code`, `user_id`, `farm_id`, `crop_name`, `crop_key`, `crop_variety`, `season`, `previous_crop`, `sowing_date`, `suitability_score`, `status`)
VALUES (1, 'CYC-84721', 1, 1, 'Tomato', 'tomato', 'Arka Rakshak (High Yield F1)', 'Kharif', 'Pulses (Green Gram)', '2026-06-15', 94, 'cultivating')
ON DUPLICATE KEY UPDATE `id`=`id`;
