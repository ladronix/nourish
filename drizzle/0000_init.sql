CREATE TABLE "api_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "app_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip_hash" text NOT NULL,
	"ok" boolean NOT NULL,
	"method" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_start" date NOT NULL,
	"tdee_estimate" integer,
	"trend_kg" real,
	"rate_kg_week" real,
	"hunger" integer,
	"energy" integer,
	"note" text,
	"applied_target_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkins_week_start_unique" UNIQUE("week_start")
);
--> statement-breakpoint
CREATE TABLE "food_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"slot" text,
	"name" text NOT NULL,
	"kcal" real NOT NULL,
	"protein" real DEFAULT 0 NOT NULL,
	"carbs" real DEFAULT 0 NOT NULL,
	"fat" real DEFAULT 0 NOT NULL,
	"fiber" real DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'quick' NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category" text NOT NULL,
	"unit" text DEFAULT 'g' NOT NULL,
	"grams_per_piece" real,
	"pack_size" real,
	"price_czk_per_pack" real,
	"kcal" real NOT NULL,
	"protein" real NOT NULL,
	"carbs" real NOT NULL,
	"fat" real NOT NULL,
	"fiber" real DEFAULT 0 NOT NULL,
	"allergens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plant" real DEFAULT 0 NOT NULL,
	"shelf_days" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_location" text DEFAULT 'fridge' NOT NULL,
	"is_staple" boolean DEFAULT false NOT NULL,
	"min_stock" real,
	"season_months" jsonb,
	"emoji" text DEFAULT '🥣' NOT NULL,
	"barcode" text,
	"source" text DEFAULT 'seed:usda-fdc-approx' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_lots" (
	"id" serial PRIMARY KEY NOT NULL,
	"ingredient_id" text,
	"recipe_id" text,
	"kind" text DEFAULT 'raw' NOT NULL,
	"name" text NOT NULL,
	"qty" real NOT NULL,
	"unit" text NOT NULL,
	"location" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_on" date,
	"opened_at" timestamp with time zone,
	"confidence" real DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"barcode" text,
	"nutrition_per_100" jsonb,
	"price_czk" real,
	"status" text DEFAULT 'active' NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_moves" (
	"id" serial PRIMARY KEY NOT NULL,
	"lot_id" integer NOT NULL,
	"delta" real NOT NULL,
	"reason" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"planned_meal_id" integer,
	"value_czk" real,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_moves_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "meal_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_start" date NOT NULL,
	"status" text DEFAULT 'generated' NOT NULL,
	"explanation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nutrition_targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"valid_from" date NOT NULL,
	"kcal_min" integer NOT NULL,
	"kcal_max" integer NOT NULL,
	"protein_min" integer NOT NULL,
	"protein_max" integer NOT NULL,
	"fat_min" integer NOT NULL,
	"fat_max" integer NOT NULL,
	"carbs_min" integer NOT NULL,
	"carbs_max" integer NOT NULL,
	"fiber_min" integer NOT NULL,
	"water_ml" integer DEFAULT 2500 NOT NULL,
	"tdee" integer NOT NULL,
	"calculation_version" text NOT NULL,
	"source" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"transports" jsonb DEFAULT '[]'::jsonb,
	"device_name" text DEFAULT 'Zařízení' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "planned_meals" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"date" date NOT NULL,
	"slot" text NOT NULL,
	"time" text NOT NULL,
	"recipe_id" text,
	"servings" real DEFAULT 1 NOT NULL,
	"from_prep" boolean DEFAULT false NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"eaten_at" timestamp with time zone,
	"kcal" real NOT NULL,
	"protein" real NOT NULL,
	"carbs" real NOT NULL,
	"fat" real NOT NULL,
	"fiber" real NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "prep_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"date" date NOT NULL,
	"recipes" jsonb NOT NULL,
	"steps" jsonb NOT NULL,
	"completed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"total_min" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"sex" text DEFAULT 'male' NOT NULL,
	"birth_year" integer DEFAULT 1990 NOT NULL,
	"height_cm" real DEFAULT 180 NOT NULL,
	"weight_kg" real DEFAULT 80 NOT NULL,
	"activity" text DEFAULT 'moderate' NOT NULL,
	"goal" text DEFAULT 'maintain' NOT NULL,
	"goal_rate_kg_week" real DEFAULT 0 NOT NULL,
	"protein_g_per_kg" real DEFAULT 1.8 NOT NULL,
	"slots" jsonb NOT NULL,
	"allergens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dislikes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"diet_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_cook_minutes_weekday" integer DEFAULT 30 NOT NULL,
	"prep_day" integer DEFAULT 0 NOT NULL,
	"budget_week_czk" integer,
	"preferred_retailer" text DEFAULT 'rohlik' NOT NULL,
	"safety_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"onboarded" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"recipe_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"qty" real NOT NULL,
	"note" text,
	"optional" boolean DEFAULT false NOT NULL,
	CONSTRAINT "recipe_ingredients_recipe_id_ingredient_id_pk" PRIMARY KEY("recipe_id","ingredient_id")
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"meal_types" jsonb NOT NULL,
	"servings" integer DEFAULT 1 NOT NULL,
	"prep_min" integer DEFAULT 10 NOT NULL,
	"cook_min" integer DEFAULT 0 NOT NULL,
	"batchable" boolean DEFAULT false NOT NULL,
	"fridge_days" integer DEFAULT 3 NOT NULL,
	"freezer_ok" boolean DEFAULT false NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"emoji" text DEFAULT '🍽️' NOT NULL,
	"image_url" text,
	"source_url" text,
	"favorite" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"time" text NOT NULL,
	"days" jsonb DEFAULT '[0,1,2,3,4,5,6]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_sent_on" date
);
--> statement-breakpoint
CREATE TABLE "shopping_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"ingredient_id" text,
	"name" text NOT NULL,
	"category" text DEFAULT 'ostatni' NOT NULL,
	"qty" real NOT NULL,
	"unit" text NOT NULL,
	"required" real,
	"available" real,
	"reason" text DEFAULT 'plan' NOT NULL,
	"est_price_czk" real,
	"checked" boolean DEFAULT false NOT NULL,
	"moved_to_inventory" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "water_log" (
	"date" date PRIMARY KEY NOT NULL,
	"ml" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weigh_ins" (
	"date" date PRIMARY KEY NOT NULL,
	"kg" real NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_moves" ADD CONSTRAINT "inventory_moves_lot_id_inventory_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_meals" ADD CONSTRAINT "planned_meals_plan_id_meal_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_meals" ADD CONSTRAINT "planned_meals_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_sessions" ADD CONSTRAINT "prep_sessions_plan_id_meal_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_attempts_ip_at" ON "auth_attempts" USING btree ("ip_hash","at");--> statement-breakpoint
CREATE INDEX "food_log_date" ON "food_log" USING btree ("date");--> statement-breakpoint
CREATE INDEX "inventory_status" ON "inventory_lots" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_plans_week" ON "meal_plans" USING btree ("week_start");--> statement-breakpoint
CREATE INDEX "planned_meals_date" ON "planned_meals" USING btree ("date");