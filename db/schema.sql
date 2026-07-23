-- 아기의 밥상 (baby_bab) — 신규 테이블
-- 공유 DB(VIBE_BABY)의 기존 users/babies/baby_users/growth_records/logs 는 재사용.
-- 모든 신규 테이블은 baby_id(→babies.id) 또는 user_id(→users.id) 스코프.

-- 냉장고 재고 (가구 공용: user_id 스코프). ingredient/cube/prepared 를 kind 로 통합
CREATE TABLE IF NOT EXISTS pantry_items (
  id             VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id        INT          NOT NULL,
  kind           ENUM('ingredient','cube','prepared') NOT NULL DEFAULT 'ingredient',
  name           VARCHAR(100) NOT NULL,
  category       VARCHAR(40)  DEFAULT NULL,
  storage        ENUM('room','fridge','freezer') NOT NULL DEFAULT 'fridge',
  quantity       DECIMAL(8,2) DEFAULT NULL,
  unit           VARCHAR(20)  DEFAULT NULL,
  cube_count     INT          DEFAULT NULL,
  cube_volume_ml INT          DEFAULT NULL,
  recipe_ref     VARCHAR(36)  DEFAULT NULL,
  purchase_date  DATE         DEFAULT NULL,
  open_date      DATE         DEFAULT NULL,
  cooked_date    DATE         DEFAULT NULL,
  expiry_date    DATE         DEFAULT NULL,
  for_baby_id    INT          DEFAULT NULL,
  note           TEXT         DEFAULT NULL,
  created_at     BIGINT       DEFAULT NULL,
  updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pantry_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 식사(이유식) 기록 (아기별)
CREATE TABLE IF NOT EXISTS meal_logs (
  id                 VARCHAR(36) NOT NULL PRIMARY KEY,
  baby_id            INT         NOT NULL,
  log_date           DATE        NOT NULL,
  log_time           TIME        DEFAULT NULL,
  menu_name          VARCHAR(120) DEFAULT NULL,
  recipe_ref         VARCHAR(36) DEFAULT NULL,
  intake_ratio       ENUM('all','half','little','refused') DEFAULT NULL,
  estimated_intake_g INT         DEFAULT NULL,
  estimated_kcal     INT         DEFAULT NULL,
  reaction           TEXT        DEFAULT NULL,
  adverse_flag       TINYINT(1)  DEFAULT 0,
  adverse_note       TEXT        DEFAULT NULL,
  is_new_ingredient  TINYINT(1)  DEFAULT 0,
  new_ingredient_name VARCHAR(100) DEFAULT NULL,
  cubes_used         JSON        DEFAULT NULL,
  note               TEXT        DEFAULT NULL,
  created_at         BIGINT      DEFAULT NULL,
  INDEX idx_meallog_baby (baby_id, log_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 끼니 사진 (base64 리사이즈본)
CREATE TABLE IF NOT EXISTS meal_photos (
  id          VARCHAR(36) NOT NULL PRIMARY KEY,
  meal_log_id VARCHAR(36) DEFAULT NULL,
  baby_id     INT         NOT NULL,
  photo_stage ENUM('before','after') DEFAULT 'before',
  image       LONGTEXT    DEFAULT NULL,
  thumb       LONGTEXT    DEFAULT NULL,
  taken_at    BIGINT      DEFAULT NULL,
  INDEX idx_photo_baby (baby_id),
  INDEX idx_photo_meallog (meal_log_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 저장한 레시피 (가구 공용)
CREATE TABLE IF NOT EXISTS saved_recipes (
  id          VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id     INT         NOT NULL,
  title       VARCHAR(160) NOT NULL,
  stage_tags  JSON        DEFAULT NULL,
  ingredients JSON        DEFAULT NULL,
  steps       JSON        DEFAULT NULL,
  nutrition   JSON        DEFAULT NULL,
  source_mode ENUM('stock_only','buy_few','fresh_shop') DEFAULT NULL,
  saved_at    BIGINT      DEFAULT NULL,
  INDEX idx_recipe_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 발달 체크 → 단계 판정 (아기별)
CREATE TABLE IF NOT EXISTS meal_dev_checks (
  id           VARCHAR(36) NOT NULL PRIMARY KEY,
  baby_id      INT         NOT NULL,
  check_date   DATE        NOT NULL,
  items        JSON        DEFAULT NULL,
  judged_stage VARCHAR(20) DEFAULT NULL,
  created_at   BIGINT      DEFAULT NULL,
  INDEX idx_devcheck_baby (baby_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 섭취 적정성 평가 (아기별, 주간)
CREATE TABLE IF NOT EXISTS assessments (
  id               VARCHAR(36) NOT NULL PRIMARY KEY,
  baby_id          INT         NOT NULL,
  week_of          DATE        NOT NULL,
  intake_kcal_avg  INT         DEFAULT NULL,
  required_kcal    INT         DEFAULT NULL,
  adequacy_pct     INT         DEFAULT NULL,
  milk_solid_ratio VARCHAR(20) DEFAULT NULL,
  llm_summary      TEXT        DEFAULT NULL,
  created_at       BIGINT      DEFAULT NULL,
  INDEX idx_assess_baby (baby_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
