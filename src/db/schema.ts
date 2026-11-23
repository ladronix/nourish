import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  date,
  jsonb,
  serial,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

/* ───────────────────────── Identity & security ───────────────────────── */

/** WebAuthn passkeys of the single owner (Face ID / Touch ID). */
export const passkeys = pgTable("passkeys", {
  id: text("id").primaryKey(), // credential ID (base64url)
  publicKey: text("public_key").notNull(), // base64url
  counter: integer("counter").notNull().default(0),
  transports: jsonb("transports").$type<string[]>().default([]),
  deviceName: text("device_name").notNull().default("Zařízení"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

/** Login attempts for rate limiting / lockout. */
export const authAttempts = pgTable(
  "auth_attempts",
  {
    id: serial("id").primaryKey(),
    ipHash: text("ip_hash").notNull(),
    ok: boolean("ok").notNull(),
    method: text("method").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_attempts_ip_at").on(t.ipHash, t.at)],
);

/** Session revocation: bumping the generation invalidates every issued cookie. */
export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Personal API tokens (iOS Shortcuts, Apple Health bridge). Only hashes are stored. */
export const apiTokens = pgTable("api_tokens", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  detail: jsonb("detail"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────────────────── Profile & targets ───────────────────────── */

export type MealSlot = "breakfast" | "snack_am" | "lunch" | "snack" | "dinner";

export const profile = pgTable("profile", {
  id: integer("id").primaryKey().default(1),
  name: text("name").notNull().default(""),
  sex: text("sex").$type<"male" | "female">().notNull().default("male"),
  birthYear: integer("birth_year").notNull().default(1990),
  heightCm: real("height_cm").notNull().default(180),
  weightKg: real("weight_kg").notNull().default(80),
  activity: text("activity").$type<"sedentary" | "light" | "moderate" | "active" | "very_active">().notNull().default("moderate"),
  goal: text("goal").$type<"lose" | "maintain" | "gain">().notNull().default("maintain"),
  goalRateKgWeek: real("goal_rate_kg_week").notNull().default(0),
  proteinGPerKg: real("protein_g_per_kg").notNull().default(1.8),
  slots: jsonb("slots").$type<{ slot: MealSlot; time: string; share: number }[]>().notNull(),
  allergens: jsonb("allergens").$type<string[]>().notNull().default([]),
  dislikes: jsonb("dislikes").$type<string[]>().notNull().default([]),
  dietTags: jsonb("diet_tags").$type<string[]>().notNull().default([]),
  maxCookMinutesWeekday: integer("max_cook_minutes_weekday").notNull().default(30),
  prepDay: integer("prep_day").notNull().default(0), // 0 = Sunday
  budgetWeekCzk: integer("budget_week_czk"),
  preferredRetailer: text("preferred_retailer").$type<"rohlik" | "kosik" | "none">().notNull().default("rohlik"),
  safetyFlags: jsonb("safety_flags").$type<string[]>().notNull().default([]),
  onboarded: boolean("onboarded").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const nutritionTargets = pgTable("nutrition_targets", {
  id: serial("id").primaryKey(),
  validFrom: date("valid_from").notNull(),
  kcalMin: integer("kcal_min").notNull(),
  kcalMax: integer("kcal_max").notNull(),
  proteinMin: integer("protein_min").notNull(),
  proteinMax: integer("protein_max").notNull(),
  fatMin: integer("fat_min").notNull(),
  fatMax: integer("fat_max").notNull(),
  carbsMin: integer("carbs_min").notNull(),
  carbsMax: integer("carbs_max").notNull(),
  fiberMin: integer("fiber_min").notNull(),
  waterMl: integer("water_ml").notNull().default(2500),
  tdee: integer("tdee").notNull(),
  calculationVersion: text("calculation_version").notNull(),
  source: jsonb("source").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────────────────── Catalog & recipes ───────────────────────── */

export type Unit = "g" | "ml" | "ks";

export const ingredients = pgTable("ingredients", {
  id: text("id").primaryKey(), // slug, independent of retailer IDs
  name: text("name").notNull(),
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  category: text("category").notNull(), // aisle: zelenina, ovoce, maso, ryby, mlecne, pecivo, trvanlive, mrazene, koreni, napoje, ostatni
  unit: text("unit").$type<Unit>().notNull().default("g"),
  gramsPerPiece: real("grams_per_piece"),
  packSize: real("pack_size"), // typical pack in `unit`
  priceCzkPerPack: real("price_czk_per_pack"),
  kcal: real("kcal").notNull(), // per 100 g (or 100 ml)
  protein: real("protein").notNull(),
  carbs: real("carbs").notNull(),
  fat: real("fat").notNull(),
  fiber: real("fiber").notNull().default(0),
  allergens: jsonb("allergens").$type<string[]>().notNull().default([]),
  plant: real("plant").notNull().default(0), // 1 = plant point, 0.25 = herb/spice
  shelfDays: jsonb("shelf_days").$type<{ fridge?: number; freezer?: number; pantry?: number; opened?: number }>().notNull().default({}),
  defaultLocation: text("default_location").$type<Location>().notNull().default("fridge"),
  isStaple: boolean("is_staple").notNull().default(false),
  minStock: real("min_stock"),
  seasonMonths: jsonb("season_months").$type<number[]>(),
  emoji: text("emoji").notNull().default("🥣"),
  barcode: text("barcode"),
  source: text("source").notNull().default("seed:usda-fdc-approx"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RecipeStep = { text: string; timerMin?: number };

export const recipes = pgTable("recipes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  mealTypes: jsonb("meal_types").$type<MealSlot[]>().notNull(),
  servings: integer("servings").notNull().default(1),
  prepMin: integer("prep_min").notNull().default(10),
  cookMin: integer("cook_min").notNull().default(0),
  batchable: boolean("batchable").notNull().default(false),
  fridgeDays: integer("fridge_days").notNull().default(3),
  freezerOk: boolean("freezer_ok").notNull().default(false),
  steps: jsonb("steps").$type<RecipeStep[]>().notNull().default([]),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  emoji: text("emoji").notNull().default("🍽️"),
  imageUrl: text("image_url"),
  sourceUrl: text("source_url"),
  favorite: boolean("favorite").notNull().default(false),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    recipeId: text("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
    ingredientId: text("ingredient_id").notNull().references(() => ingredients.id),
    qty: real("qty").notNull(), // in ingredient.unit, for the whole recipe (all servings)
    note: text("note"),
    optional: boolean("optional").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.ingredientId] })],
);

/* ───────────────────────── Inventory ───────────────────────── */

export type Location = "fridge" | "freezer" | "pantry";

export const inventoryLots = pgTable(
  "inventory_lots",
  {
    id: serial("id").primaryKey(),
    ingredientId: text("ingredient_id").references(() => ingredients.id),
    recipeId: text("recipe_id").references(() => recipes.id), // set for cooked portions (leftovers)
    kind: text("kind").$type<"raw" | "portion">().notNull().default("raw"),
    name: text("name").notNull(),
    qty: real("qty").notNull(),
    unit: text("unit").$type<Unit>().notNull(),
    location: text("location").$type<Location>().notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    expiresOn: date("expires_on"),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    confidence: real("confidence").notNull().default(1),
    source: text("source").$type<"manual" | "barcode" | "photo" | "receipt" | "shopping" | "prep" | "shortcut">().notNull().default("manual"),
    barcode: text("barcode"),
    nutritionPer100: jsonb("nutrition_per_100").$type<{ kcal: number; protein: number; carbs: number; fat: number; fiber: number }>(),
    priceCzk: real("price_czk"),
    status: text("status").$type<"active" | "used" | "discarded">().notNull().default("active"),
    needsReview: boolean("needs_review").notNull().default(false),
  },
  (t) => [index("inventory_status").on(t.status)],
);

export const inventoryMoves = pgTable("inventory_moves", {
  id: serial("id").primaryKey(),
  lotId: integer("lot_id").notNull().references(() => inventoryLots.id, { onDelete: "cascade" }),
  delta: real("delta").notNull(),
  reason: text("reason").$type<"add" | "consume" | "discard" | "adjust" | "cook">().notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  plannedMealId: integer("planned_meal_id"),
  valueCzk: real("value_czk"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────────────────── Planning ───────────────────────── */

export const mealPlans = pgTable(
  "meal_plans",
  {
    id: serial("id").primaryKey(),
    weekStart: date("week_start").notNull(),
    status: text("status").$type<"generated" | "confirmed" | "active" | "completed" | "cancelled">().notNull().default("generated"),
    explanation: jsonb("explanation").$type<PlanExplanation>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("meal_plans_week").on(t.weekStart)],
);

export type PlanExplanation = {
  notes: string[];
  usedFromInventory: string[];
  uncovered: string[];
  avgKcal: number;
  avgProtein: number;
  plantPoints: number;
  estCostCzk: number;
  cookMinutes: number;
};

export const plannedMeals = pgTable(
  "planned_meals",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id").notNull().references(() => mealPlans.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    slot: text("slot").$type<MealSlot>().notNull(),
    time: text("time").notNull(),
    recipeId: text("recipe_id").references(() => recipes.id),
    servings: real("servings").notNull().default(1),
    fromPrep: boolean("from_prep").notNull().default(false), // eaten from batch/leftover portion
    locked: boolean("locked").notNull().default(false),
    status: text("status").$type<"planned" | "eaten" | "skipped" | "swapped">().notNull().default("planned"),
    eatenAt: timestamp("eaten_at", { withTimezone: true }),
    kcal: real("kcal").notNull(),
    protein: real("protein").notNull(),
    carbs: real("carbs").notNull(),
    fat: real("fat").notNull(),
    fiber: real("fiber").notNull(),
    note: text("note"),
  },
  (t) => [index("planned_meals_date").on(t.date)],
);

/** Free logging outside the plan: photo-to-macros, barcode, quick add, eating out. */
export const foodLog = pgTable(
  "food_log",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    slot: text("slot").$type<MealSlot>(),
    name: text("name").notNull(),
    kcal: real("kcal").notNull(),
    protein: real("protein").notNull().default(0),
    carbs: real("carbs").notNull().default(0),
    fat: real("fat").notNull().default(0),
    fiber: real("fiber").notNull().default(0),
    source: text("source").$type<"quick" | "photo" | "barcode" | "shortcut" | "inventory">().notNull().default("quick"),
    confidence: real("confidence").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("food_log_date").on(t.date)],
);

export const waterLog = pgTable("water_log", {
  date: date("date").primaryKey(),
  ml: integer("ml").notNull().default(0),
});

export const weighIns = pgTable("weigh_ins", {
  date: date("date").primaryKey(),
  kg: real("kg").notNull(),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const checkins = pgTable("checkins", {
  id: serial("id").primaryKey(),
  weekStart: date("week_start").notNull().unique(),
  tdeeEstimate: integer("tdee_estimate"),
  trendKg: real("trend_kg"),
  rateKgWeek: real("rate_kg_week"),
  hunger: integer("hunger"), // 1–5
  energy: integer("energy"), // 1–5
  note: text("note"),
  appliedTargetId: integer("applied_target_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────────────────── Prep ───────────────────────── */

export type PrepStep = {
  id: string;
  text: string;
  recipeId: string;
  recipeName: string;
  startMin: number;
  durationMin: number;
  passive: boolean; // oven/simmer — hands free
  equipment?: string;
};

export const prepSessions = pgTable("prep_sessions", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => mealPlans.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  recipes: jsonb("recipes").$type<{ recipeId: string; servings: number }[]>().notNull(),
  steps: jsonb("steps").$type<PrepStep[]>().notNull(),
  completed: jsonb("completed").$type<string[]>().notNull().default([]),
  status: text("status").$type<"planned" | "in_progress" | "done">().notNull().default("planned"),
  totalMin: integer("total_min").notNull(),
});

/* ───────────────────────── Shopping ───────────────────────── */

export const shoppingItems = pgTable("shopping_items", {
  id: serial("id").primaryKey(),
  ingredientId: text("ingredient_id").references(() => ingredients.id),
  name: text("name").notNull(),
  category: text("category").notNull().default("ostatni"),
  qty: real("qty").notNull(),
  unit: text("unit").$type<Unit>().notNull(),
  required: real("required"),
  available: real("available"),
  reason: text("reason").$type<"plan" | "min_stock" | "manual">().notNull().default("plan"),
  estPriceCzk: real("est_price_czk"),
  checked: boolean("checked").notNull().default(false),
  movedToInventory: boolean("moved_to_inventory").notNull().default(false),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────────────────── Notifications ───────────────────────── */

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reminders = pgTable("reminders", {
  id: text("id").primaryKey(), // meal | prep | expiry | weigh | shopping | water
  label: text("label").notNull(),
  time: text("time").notNull(), // HH:MM Europe/Prague
  days: jsonb("days").$type<number[]>().notNull().default([0, 1, 2, 3, 4, 5, 6]),
  enabled: boolean("enabled").notNull().default(true),
  lastSentOn: date("last_sent_on"),
});

/** Items sent via iOS Shortcut "Send to Nourish" (URL, text, photo). */
export const inbox = pgTable("inbox", {
  id: serial("id").primaryKey(),
  kind: text("kind").$type<"url" | "text" | "image">().notNull(),
  content: text("content").notNull(),
  processed: boolean("processed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
