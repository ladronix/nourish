/**
 * Seed catalog. Nutrition per 100 g/ml — approximations of USDA FoodData Central (public domain, CC0)
 * SR Legacy / Foundation values, rounded. Prices are rough Prague e-grocery estimates (CZK, 2026) —
 * only for budgeting; the retailer is the source of truth at checkout.
 * Shelf life days loosely follow USDA FoodKeeper (CC0).
 */
import type { MealSlot } from "./schema";

type I = {
  id: string; name: string; cat: string; unit?: "g" | "ml" | "ks"; gpp?: number; pack?: number; price?: number;
  n: [number, number, number, number, number]; // kcal, protein, carbs, fat, fiber
  al?: string[]; plant?: number; shelf?: { fridge?: number; freezer?: number; pantry?: number; opened?: number };
  loc?: "fridge" | "freezer" | "pantry"; staple?: boolean; min?: number; season?: number[]; e: string; aliases?: string[];
};

export const INGREDIENTS: I[] = [
  // Maso & ryby
  { id: "kureci-prsa", name: "Kuřecí prsa", cat: "maso", pack: 500, price: 139, n: [110, 23, 0, 1.5, 0], shelf: { fridge: 2, freezer: 270 }, e: "🍗", aliases: ["kuře", "kuřecí"] },
  { id: "kureci-stehna", name: "Kuřecí stehna bez kosti", cat: "maso", pack: 500, price: 119, n: [165, 19, 0, 9.5, 0], shelf: { fridge: 2, freezer: 270 }, e: "🍗" },
  { id: "kruti-prsa", name: "Krůtí prsa", cat: "maso", pack: 400, price: 129, n: [111, 24, 0, 1.2, 0], shelf: { fridge: 2, freezer: 270 }, e: "🦃" },
  { id: "hovezi-mlete", name: "Hovězí mleté 10 %", cat: "maso", pack: 500, price: 169, n: [176, 20, 0, 10, 0], shelf: { fridge: 2, freezer: 120 }, e: "🥩" },
  { id: "hovezi-kyta", name: "Hovězí kýta", cat: "maso", pack: 500, price: 229, n: [130, 22, 0, 4.5, 0], shelf: { fridge: 3, freezer: 270 }, e: "🥩" },
  { id: "veprova-panenka", name: "Vepřová panenka", cat: "maso", pack: 500, price: 179, n: [120, 21, 0, 3.5, 0], shelf: { fridge: 3, freezer: 180 }, e: "🥓" },
  { id: "sunka", name: "Šunka nejvyšší jakosti", cat: "maso", pack: 100, price: 45, n: [110, 20, 1, 3, 0], shelf: { fridge: 7, opened: 3 }, e: "🥓" },
  { id: "losos", name: "Losos filet", cat: "ryby", pack: 250, price: 159, n: [208, 20, 0, 13, 0], al: ["fish"], shelf: { fridge: 2, freezer: 90 }, e: "🐟" },
  { id: "treska", name: "Treska filet", cat: "ryby", pack: 400, price: 149, n: [82, 18, 0, 0.7, 0], al: ["fish"], shelf: { fridge: 2, freezer: 180 }, loc: "freezer", e: "🐟" },
  { id: "tunak", name: "Tuňák ve vlastní šťávě", cat: "trvanlive", pack: 120, price: 45, n: [116, 26, 0, 1, 0], al: ["fish"], shelf: { pantry: 900, opened: 2 }, loc: "pantry", e: "🥫" },
  { id: "krevety", name: "Krevety loupané", cat: "mrazene", pack: 250, price: 159, n: [85, 20, 0, 0.5, 0], al: ["crustaceans"], shelf: { freezer: 180, fridge: 2 }, loc: "freezer", e: "🦐" },
  // Mléčné & vejce
  { id: "vejce", name: "Vejce M", cat: "mlecne", unit: "ks", gpp: 55, pack: 10, price: 59, n: [143, 12.6, 0.7, 9.5, 0], al: ["eggs"], shelf: { fridge: 28 }, min: 4, e: "🥚" },
  { id: "recky-jogurt", name: "Řecký jogurt 5 %", cat: "mlecne", pack: 500, price: 55, n: [97, 9, 4, 5, 0], al: ["milk"], shelf: { fridge: 14, opened: 4 }, e: "🥣" },
  { id: "skyr", name: "Skyr bílý", cat: "mlecne", pack: 450, price: 49, n: [63, 11, 4, 0.2, 0], al: ["milk"], shelf: { fridge: 21, opened: 4 }, e: "🥛" },
  { id: "tvaroh", name: "Tvaroh polotučný", cat: "mlecne", pack: 250, price: 32, n: [110, 13, 3.5, 4.5, 0], al: ["milk"], shelf: { fridge: 14, opened: 3 }, e: "🧀" },
  { id: "cottage", name: "Cottage sýr", cat: "mlecne", pack: 180, price: 35, n: [98, 11, 3.4, 4.3, 0], al: ["milk"], shelf: { fridge: 14, opened: 4 }, e: "🧀" },
  { id: "mleko", name: "Mléko polotučné", cat: "mlecne", unit: "ml", pack: 1000, price: 25, n: [47, 3.4, 4.8, 1.5, 0], al: ["milk"], shelf: { fridge: 10, opened: 4 }, e: "🥛" },
  { id: "eidam", name: "Eidam 30 %", cat: "mlecne", pack: 100, price: 32, n: [260, 30, 0, 15, 0], al: ["milk"], shelf: { fridge: 21, opened: 10 }, e: "🧀" },
  { id: "mozzarella", name: "Mozzarella light", cat: "mlecne", pack: 125, price: 29, n: [165, 19, 1, 9, 0], al: ["milk"], shelf: { fridge: 14, opened: 3 }, e: "🧀" },
  { id: "halloumi", name: "Halloumi", cat: "mlecne", pack: 225, price: 79, n: [320, 22, 2, 25, 0], al: ["milk"], shelf: { fridge: 30, opened: 5 }, e: "🧀" },
  { id: "feta", name: "Balkánský sýr / feta", cat: "mlecne", pack: 200, price: 49, n: [264, 14, 4, 21, 0], al: ["milk"], shelf: { fridge: 30, opened: 5 }, e: "🧀" },
  { id: "parmazan", name: "Parmazán", cat: "mlecne", pack: 100, price: 69, n: [392, 36, 3, 26, 0], al: ["milk"], shelf: { fridge: 60 }, e: "🧀" },
  { id: "maslo", name: "Máslo", cat: "mlecne", pack: 250, price: 59, n: [717, 0.9, 0.1, 81, 0], al: ["milk"], shelf: { fridge: 60, freezer: 270 }, staple: true, e: "🧈" },
  { id: "protein-whey", name: "Syrovátkový protein", cat: "trvanlive", pack: 1000, price: 699, n: [390, 78, 8, 6, 0], al: ["milk"], shelf: { pantry: 365 }, loc: "pantry", e: "🥤" },
  // Zelenina
  { id: "spenat", name: "Baby špenát", cat: "zelenina", pack: 125, price: 39, n: [23, 2.9, 3.6, 0.4, 2.2], plant: 1, shelf: { fridge: 5, opened: 2 }, season: [4, 5, 9, 10], e: "🥬" },
  { id: "brokolice", name: "Brokolice", cat: "zelenina", pack: 500, price: 45, n: [34, 2.8, 6.6, 0.4, 2.6], plant: 1, shelf: { fridge: 6, freezer: 300 }, season: [6, 7, 8, 9, 10], e: "🥦" },
  { id: "paprika", name: "Paprika červená", cat: "zelenina", unit: "ks", gpp: 180, n: [31, 1, 6, 0.3, 2.1], plant: 1, price: 25, pack: 1, shelf: { fridge: 7 }, season: [7, 8, 9], e: "🫑" },
  { id: "rajcata", name: "Cherry rajčata", cat: "zelenina", pack: 250, price: 45, n: [18, 0.9, 3.9, 0.2, 1.2], plant: 1, shelf: { fridge: 7, pantry: 4 }, season: [7, 8, 9], e: "🍅" },
  { id: "okurka", name: "Okurka salátová", cat: "zelenina", unit: "ks", gpp: 350, pack: 1, price: 22, n: [15, 0.7, 3.6, 0.1, 0.5], plant: 1, shelf: { fridge: 7 }, season: [6, 7, 8], e: "🥒" },
  { id: "cuketa", name: "Cuketa", cat: "zelenina", unit: "ks", gpp: 300, pack: 1, price: 25, n: [17, 1.2, 3.1, 0.3, 1], plant: 1, shelf: { fridge: 7 }, season: [6, 7, 8, 9], e: "🥒" },
  { id: "mrkev", name: "Mrkev", cat: "zelenina", pack: 1000, price: 25, n: [41, 0.9, 9.6, 0.2, 2.8], plant: 1, shelf: { fridge: 21 }, season: [7, 8, 9, 10, 11, 12, 1, 2, 3], e: "🥕" },
  { id: "cibule", name: "Cibule", cat: "zelenina", pack: 1000, price: 25, n: [40, 1.1, 9.3, 0.1, 1.7], plant: 1, shelf: { pantry: 30 }, loc: "pantry", min: 300, e: "🧅" },
  { id: "cesnek", name: "Česnek", cat: "zelenina", pack: 100, price: 25, n: [149, 6.4, 33, 0.5, 2.1], plant: 0.25, shelf: { pantry: 60 }, loc: "pantry", staple: true, e: "🧄" },
  { id: "brambory", name: "Brambory", cat: "zelenina", pack: 2000, price: 45, n: [77, 2, 17, 0.1, 2.2], plant: 1, shelf: { pantry: 30 }, loc: "pantry", season: [7, 8, 9, 10, 11, 12, 1, 2], e: "🥔" },
  { id: "batat", name: "Batáty", cat: "zelenina", pack: 1000, price: 59, n: [86, 1.6, 20, 0.1, 3], plant: 1, shelf: { pantry: 21 }, loc: "pantry", season: [10, 11, 12, 1], e: "🍠" },
  { id: "salat-mix", name: "Listový salát mix", cat: "zelenina", pack: 150, price: 39, n: [17, 1.4, 3, 0.2, 1.6], plant: 1, shelf: { fridge: 5, opened: 2 }, e: "🥗" },
  { id: "rukola", name: "Rukola", cat: "zelenina", pack: 80, price: 35, n: [25, 2.6, 3.7, 0.7, 1.6], plant: 1, shelf: { fridge: 5 }, e: "🌿" },
  { id: "zampiony", name: "Žampiony", cat: "zelenina", pack: 250, price: 39, n: [22, 3.1, 3.3, 0.3, 1], plant: 1, shelf: { fridge: 5 }, e: "🍄" },
  { id: "avokado", name: "Avokádo", cat: "zelenina", unit: "ks", gpp: 150, pack: 1, price: 29, n: [160, 2, 8.5, 14.7, 6.7], plant: 1, shelf: { pantry: 4, fridge: 5 }, e: "🥑" },
  { id: "kapusta", name: "Kapusta / kale", cat: "zelenina", pack: 200, price: 39, n: [49, 4.3, 8.8, 0.9, 3.6], plant: 1, shelf: { fridge: 6 }, season: [10, 11, 12, 1, 2], e: "🥬" },
  { id: "cervena-repa", name: "Červená řepa vařená", cat: "zelenina", pack: 500, price: 35, n: [44, 1.7, 10, 0.2, 2], plant: 1, shelf: { fridge: 14 }, season: [8, 9, 10, 11, 12, 1, 2], e: "🫜" },
  { id: "dyne", name: "Dýně hokkaido", cat: "zelenina", unit: "ks", gpp: 1200, pack: 1, price: 49, n: [34, 1, 8, 0.1, 1.5], plant: 1, shelf: { pantry: 60 }, loc: "pantry", season: [9, 10, 11, 12], e: "🎃" },
  { id: "zeleni-fazolky", name: "Zelené fazolky mražené", cat: "mrazene", pack: 450, price: 45, n: [31, 1.8, 7, 0.1, 3.4], plant: 1, shelf: { freezer: 300 }, loc: "freezer", e: "🫛" },
  { id: "hrasek", name: "Hrášek mražený", cat: "mrazene", pack: 450, price: 39, n: [77, 5.2, 13.6, 0.4, 5], plant: 1, shelf: { freezer: 300 }, loc: "freezer", e: "🫛" },
  { id: "zelenina-mix-mrazena", name: "Zeleninová směs mražená", cat: "mrazene", pack: 450, price: 45, n: [45, 2.5, 7, 0.4, 3], plant: 1, shelf: { freezer: 300 }, loc: "freezer", min: 1, e: "🥦" },
  { id: "kukurice", name: "Kukuřice sterilovaná", cat: "trvanlive", pack: 285, price: 29, n: [86, 3.2, 19, 1.2, 2], plant: 1, shelf: { pantry: 700, opened: 3 }, loc: "pantry", e: "🌽" },
  { id: "rajcata-pasirovana", name: "Pasírovaná rajčata", cat: "trvanlive", pack: 500, price: 32, n: [24, 1.3, 4.5, 0.2, 1.2], plant: 1, shelf: { pantry: 700, opened: 4 }, loc: "pantry", min: 1, e: "🥫" },
  { id: "zazvor", name: "Zázvor", cat: "zelenina", pack: 100, price: 15, n: [80, 1.8, 18, 0.8, 2], plant: 0.25, shelf: { fridge: 21 }, e: "🫚" },
  { id: "citron", name: "Citron", cat: "ovoce", unit: "ks", gpp: 100, pack: 1, price: 12, n: [29, 1.1, 9, 0.3, 2.8], plant: 1, shelf: { fridge: 21, pantry: 7 }, e: "🍋" },
  { id: "bylinky", name: "Čerstvé bylinky (petržel/koriandr)", cat: "zelenina", pack: 30, price: 29, n: [36, 3, 6, 0.8, 3.3], plant: 0.25, shelf: { fridge: 5 }, e: "🌿" },
  // Ovoce
  { id: "banan", name: "Banán", cat: "ovoce", unit: "ks", gpp: 120, pack: 1, price: 7, n: [89, 1.1, 23, 0.3, 2.6], plant: 1, shelf: { pantry: 5 }, loc: "pantry", e: "🍌" },
  { id: "jablko", name: "Jablko", cat: "ovoce", unit: "ks", gpp: 170, pack: 1, price: 8, n: [52, 0.3, 14, 0.2, 2.4], plant: 1, shelf: { fridge: 30, pantry: 7 }, season: [8, 9, 10, 11, 12, 1, 2, 3], e: "🍎" },
  { id: "lesni-ovoce", name: "Lesní ovoce mražené", cat: "mrazene", pack: 400, price: 69, n: [50, 0.9, 11, 0.3, 4], plant: 1, shelf: { freezer: 300, fridge: 2 }, loc: "freezer", e: "🫐" },
  { id: "boruvky", name: "Borůvky čerstvé", cat: "ovoce", pack: 125, price: 59, n: [57, 0.7, 14, 0.3, 2.4], plant: 1, shelf: { fridge: 7 }, season: [6, 7, 8], e: "🫐" },
  { id: "maliny", name: "Maliny", cat: "ovoce", pack: 125, price: 59, n: [52, 1.2, 12, 0.7, 6.5], plant: 1, shelf: { fridge: 3 }, season: [6, 7, 8], e: "🍓" },
  { id: "pomeranc", name: "Pomeranč", cat: "ovoce", unit: "ks", gpp: 180, pack: 1, price: 10, n: [47, 0.9, 12, 0.1, 2.4], plant: 1, shelf: { pantry: 10, fridge: 21 }, season: [11, 12, 1, 2, 3], e: "🍊" },
  { id: "hruska", name: "Hruška", cat: "ovoce", unit: "ks", gpp: 180, pack: 1, price: 10, n: [57, 0.4, 15, 0.1, 3.1], plant: 1, shelf: { fridge: 10, pantry: 5 }, season: [8, 9, 10, 11], e: "🍐" },
  // Pečivo & obiloviny
  { id: "zitny-chleb", name: "Žitný chléb", cat: "pecivo", pack: 500, price: 45, n: [250, 8.5, 48, 3.3, 6], al: ["gluten"], plant: 1, shelf: { pantry: 4, freezer: 90 }, loc: "pantry", e: "🍞" },
  { id: "tortilla", name: "Celozrnná tortilla", cat: "pecivo", unit: "ks", gpp: 60, pack: 6, price: 49, n: [300, 9, 48, 7.5, 6], al: ["gluten"], shelf: { pantry: 14 }, loc: "pantry", e: "🌯" },
  { id: "ovesne-vlocky", name: "Ovesné vločky", cat: "trvanlive", pack: 500, price: 25, n: [379, 13, 60, 6.5, 10], al: ["gluten"], plant: 1, shelf: { pantry: 365 }, loc: "pantry", min: 200, e: "🌾" },
  { id: "ryze-basmati", name: "Rýže basmati", cat: "trvanlive", pack: 1000, price: 69, n: [355, 8, 78, 0.8, 1.3], plant: 1, shelf: { pantry: 730 }, loc: "pantry", min: 300, e: "🍚" },
  { id: "ryze-natural", name: "Rýže natural", cat: "trvanlive", pack: 1000, price: 59, n: [362, 7.5, 76, 2.7, 3.5], plant: 1, shelf: { pantry: 365 }, loc: "pantry", e: "🍚" },
  { id: "testoviny", name: "Celozrnné těstoviny", cat: "trvanlive", pack: 500, price: 39, n: [348, 13, 65, 2.5, 8], al: ["gluten"], plant: 1, shelf: { pantry: 730 }, loc: "pantry", min: 250, e: "🍝" },
  { id: "bulgur", name: "Bulgur", cat: "trvanlive", pack: 500, price: 45, n: [342, 12, 76, 1.3, 12.5], al: ["gluten"], plant: 1, shelf: { pantry: 365 }, loc: "pantry", e: "🌾" },
  { id: "quinoa", name: "Quinoa", cat: "trvanlive", pack: 500, price: 89, n: [368, 14, 64, 6, 7], plant: 1, shelf: { pantry: 365 }, loc: "pantry", e: "🌾" },
  { id: "kuskus", name: "Kuskus celozrnný", cat: "trvanlive", pack: 500, price: 45, n: [360, 12, 72, 1.5, 7], al: ["gluten"], plant: 1, shelf: { pantry: 365 }, loc: "pantry", e: "🌾" },
  // Luštěniny
  { id: "cocka-cervena", name: "Červená čočka", cat: "lusteniny", pack: 500, price: 49, n: [358, 24, 60, 1.5, 11], plant: 1, shelf: { pantry: 365 }, loc: "pantry", e: "🫘" },
  { id: "cizrna", name: "Cizrna sterilovaná", cat: "lusteniny", pack: 240, price: 29, n: [139, 7, 18, 2.6, 6], plant: 1, shelf: { pantry: 700, opened: 3 }, loc: "pantry", e: "🫘" },
  { id: "fazole-cerne", name: "Černé fazole sterilované", cat: "lusteniny", pack: 240, price: 32, n: [132, 8.9, 18, 0.5, 8.7], plant: 1, shelf: { pantry: 700, opened: 3 }, loc: "pantry", e: "🫘" },
  { id: "tofu", name: "Tofu natural", cat: "lusteniny", pack: 180, price: 39, n: [144, 15, 2, 8.7, 2.3], al: ["soy"], plant: 1, shelf: { fridge: 21, opened: 4 }, e: "🧊" },
  { id: "edamame", name: "Edamame mražené", cat: "mrazene", pack: 400, price: 79, n: [121, 12, 9, 5, 5], al: ["soy"], plant: 1, shelf: { freezer: 300 }, loc: "freezer", e: "🫛" },
  // Ořechy, semínka, tuky
  { id: "mandle", name: "Mandle", cat: "orechy", pack: 100, price: 49, n: [579, 21, 22, 50, 12.5], al: ["nuts"], plant: 1, shelf: { pantry: 180 }, loc: "pantry", e: "🌰" },
  { id: "vlasske-orechy", name: "Vlašské ořechy", cat: "orechy", pack: 100, price: 45, n: [654, 15, 14, 65, 6.7], al: ["nuts"], plant: 1, shelf: { pantry: 120 }, loc: "pantry", e: "🌰" },
  { id: "arasidove-maslo", name: "Arašídové máslo 100 %", cat: "orechy", pack: 350, price: 79, n: [600, 25, 16, 50, 6], al: ["peanuts"], plant: 1, shelf: { pantry: 180 }, loc: "pantry", e: "🥜" },
  { id: "chia", name: "Chia semínka", cat: "orechy", pack: 250, price: 49, n: [486, 17, 42, 31, 34], plant: 1, shelf: { pantry: 365 }, loc: "pantry", e: "🌱" },
  { id: "lneny-dyne-seminka", name: "Dýňová semínka", cat: "orechy", pack: 100, price: 39, n: [559, 30, 11, 49, 6], plant: 1, shelf: { pantry: 180 }, loc: "pantry", e: "🌱" },
  { id: "sezam", name: "Sezam", cat: "orechy", pack: 100, price: 25, n: [573, 18, 23, 50, 12], al: ["sesame"], plant: 0.25, shelf: { pantry: 365 }, loc: "pantry", e: "🌱" },
  { id: "olivovy-olej", name: "Olivový olej", cat: "koreni", unit: "ml", pack: 500, price: 149, n: [820, 0, 0, 92, 0], shelf: { pantry: 365 }, loc: "pantry", staple: true, e: "🫒" },
  // Dochucovadla
  { id: "sojova-omacka", name: "Sójová omáčka", cat: "koreni", unit: "ml", pack: 250, price: 49, n: [53, 8, 5, 0.6, 0.8], al: ["soy", "gluten"], shelf: { pantry: 730 }, loc: "pantry", staple: true, e: "🥢" },
  { id: "med", name: "Med", cat: "koreni", pack: 500, price: 149, n: [304, 0.3, 82, 0, 0.2], shelf: { pantry: 730 }, loc: "pantry", staple: true, e: "🍯" },
  { id: "horcice", name: "Dijonská hořčice", cat: "koreni", pack: 200, price: 45, n: [66, 4, 6, 3.5, 3], al: ["mustard"], shelf: { pantry: 365, opened: 180 }, loc: "pantry", staple: true, e: "🌭" },
  { id: "kari-pasta", name: "Kari pasta", cat: "koreni", pack: 100, price: 59, n: [150, 3, 15, 8, 4], shelf: { pantry: 365, opened: 30 }, loc: "pantry", e: "🍛" },
  { id: "kokosove-mleko", name: "Kokosové mléko light", cat: "trvanlive", unit: "ml", pack: 400, price: 49, n: [75, 0.6, 2.5, 7, 0], plant: 0.25, shelf: { pantry: 700, opened: 3 }, loc: "pantry", e: "🥥" },
  { id: "koreni-mix", name: "Koření (paprika, kmín, oregano…)", cat: "koreni", pack: 30, price: 25, n: [300, 12, 50, 10, 30], plant: 0.25, shelf: { pantry: 730 }, loc: "pantry", staple: true, e: "🧂" },
  { id: "sul-pepr", name: "Sůl a pepř", cat: "koreni", pack: 500, price: 15, n: [0, 0, 0, 0, 0], shelf: { pantry: 3650 }, loc: "pantry", staple: true, e: "🧂" },
  { id: "hummus", name: "Hummus", cat: "mlecne", pack: 200, price: 49, n: [237, 7.9, 14, 17, 6], al: ["sesame"], plant: 1, shelf: { fridge: 10, opened: 4 }, e: "🫙" },
  { id: "pesto", name: "Bazalkové pesto", cat: "koreni", pack: 190, price: 79, n: [450, 5, 6, 45, 2], al: ["milk", "nuts"], plant: 0.25, shelf: { pantry: 365, opened: 10 }, loc: "pantry", e: "🌿" },
  { id: "tmava-cokolada", name: "Hořká čokoláda 85 %", cat: "trvanlive", pack: 100, price: 49, n: [600, 11, 20, 50, 12], al: ["milk"], plant: 0.25, shelf: { pantry: 365 }, loc: "pantry", e: "🍫" },
];

type Rc = {
  id: string; name: string; d: string; types: MealSlot[]; serv: number; prep: number; cook: number; batch?: boolean; fridge?: number; freezer?: boolean;
  tags?: string[]; e: string; items: [string, number, string?][]; steps: [string, number?][]; fav?: boolean;
};

export const RECIPES: Rc[] = [
  // Snídaně
  { id: "jogurt-ovoce-mandle", name: "Řecký jogurt, lesní ovoce a mandle", d: "Tři minuty, 30 g bílkovin, žádné vaření.", types: ["breakfast", "snack"], serv: 1, prep: 3, cook: 0, tags: ["vegetarian", "rychle"], e: "🥣", items: [["recky-jogurt", 250], ["lesni-ovoce", 100], ["mandle", 15], ["med", 5]], steps: [["Jogurt dej do misky."], ["Přidej ovoce (mražené nech chvíli povolit) a nasekané mandle."], ["Pokapej medem."]] },
  { id: "overnight-oats", name: "Overnight oats se skyrem a chia", d: "Připrav večer, ráno jen vezmi z lednice.", types: ["breakfast"], serv: 1, prep: 5, cook: 0, fridge: 3, batch: false, tags: ["vegetarian", "meal-prep"], e: "🌾", items: [["ovesne-vlocky", 60], ["skyr", 150], ["mleko", 100], ["chia", 10], ["boruvky", 60]], steps: [["Smíchej vločky, chia, skyr a mléko ve skleničce."], ["Navrch dej borůvky, zavři a dej přes noc do lednice."]] },
  { id: "vejce-avokado-chleb", name: "Vejce, avokádo a žitný chléb", d: "Klasika, která zasytí do oběda.", types: ["breakfast", "snack"], serv: 1, prep: 3, cook: 7, tags: ["vegetarian"], e: "🥑", items: [["vejce", 2], ["avokado", 0.5], ["zitny-chleb", 70], ["rajcata", 60], ["sul-pepr", 1]], steps: [["Vejce vař 7 minut, zchlaď ve studené vodě.", 7], ["Chléb opeč, potři rozmačkaným avokádem."], ["Přidej nakrájená vejce a rajčata, osol a opepři."]] },
  { id: "omeleta-spenat-feta", name: "Omeleta se špenátem a fetou", d: "Proteinová snídaně za 10 minut.", types: ["breakfast", "dinner"], serv: 1, prep: 3, cook: 6, tags: ["vegetarian", "low-carb"], e: "🍳", items: [["vejce", 3], ["spenat", 50], ["feta", 30], ["olivovy-olej", 5], ["zitny-chleb", 50]], steps: [["Vejce rozšlehej se solí."], ["Na oleji krátce zavadni špenát.", 2], ["Zalij vejci, posyp fetou a peč na mírném ohni pod pokličkou.", 4], ["Podávej s chlebem."]] },
  { id: "tvarohova-kase", name: "Ovesná kaše s tvarohem a jablkem", d: "Teplá snídaně do zimy, skoro 35 g bílkovin.", types: ["breakfast"], serv: 1, prep: 2, cook: 6, tags: ["vegetarian"], e: "🍎", items: [["ovesne-vlocky", 60], ["mleko", 200], ["tvaroh", 125], ["jablko", 1], ["vlasske-orechy", 10]], steps: [["Vločky vař v mléce za stálého míchání.", 5], ["Odstav, vmíchej tvaroh."], ["Přidej nastrouhané jablko a ořechy, případně skořici."]] },
  { id: "proteinove-palacinky", name: "Proteinové lívance s ovocem", d: "Víkendová snídaně, kterou zvládneš i ve středu.", types: ["breakfast"], serv: 1, prep: 5, cook: 10, tags: ["vegetarian"], e: "🥞", items: [["ovesne-vlocky", 50], ["vejce", 2], ["skyr", 100], ["banan", 1], ["lesni-ovoce", 80]], steps: [["Rozmixuj vločky, vejce, skyr a půlku banánu."], ["Na suché nepřilnavé pánvi peč malé lívance z obou stran.", 10], ["Podávej s ovocem a zbytkem banánu."]] },
  // Obědy – batch
  { id: "kure-ryze-zelenina", name: "Bylinkové kuře, rýže a pečená zelenina", d: "Základ meal prepu: 4 krabičky za necelou hodinu.", types: ["lunch", "dinner"], serv: 4, prep: 15, cook: 35, batch: true, fridge: 4, freezer: true, tags: ["meal-prep"], e: "🍗", fav: true, items: [["kureci-prsa", 700], ["ryze-basmati", 280], ["brokolice", 400], ["paprika", 2], ["olivovy-olej", 25], ["koreni-mix", 8], ["citron", 1]], steps: [["Rozehřej troubu na 210 °C."], ["Kuře nakrájej, obal v oleji, koření a citronové kůře."], ["Zeleninu nakrájej na plech, kuře přidej na druhý plech."], ["Peč kuře a zeleninu v troubě.", 25], ["Mezitím vař rýži.", 15], ["Vše rozděl do 4 krabiček s citronovou šťávou."]] },
  { id: "chilli-con-carne", name: "Chilli con carne s fazolemi", d: "Mrazí se skvěle, chutná líp druhý den.", types: ["lunch", "dinner"], serv: 5, prep: 15, cook: 40, batch: true, fridge: 4, freezer: true, tags: ["meal-prep"], e: "🌶️", items: [["hovezi-mlete", 600], ["fazole-cerne", 480], ["rajcata-pasirovana", 700], ["cibule", 200], ["paprika", 2], ["kukurice", 285], ["koreni-mix", 10], ["olivovy-olej", 15], ["ryze-natural", 300]], steps: [["Cibuli a papriku nakrájej, osmahni na oleji.", 5], ["Přidej maso, opeč dohněda.", 8], ["Přidej koření, rajčata, fazole a kukuřici."], ["Duš pod pokličkou na mírném ohni.", 30], ["Mezitím vař rýži.", 20], ["Rozděl do 5 krabiček."]] },
  { id: "cockovy-dal", name: "Čočkový dal se špenátem", d: "Rostlinné bílkoviny, vláknina a 6 rostlin v jedné misce.", types: ["lunch", "dinner"], serv: 4, prep: 10, cook: 25, batch: true, fridge: 5, freezer: true, tags: ["vegetarian", "vegan", "meal-prep"], e: "🍛", items: [["cocka-cervena", 300], ["kokosove-mleko", 400], ["rajcata-pasirovana", 500], ["cibule", 150], ["cesnek", 15], ["zazvor", 15], ["kari-pasta", 40], ["spenat", 125], ["ryze-basmati", 240]], steps: [["Cibuli, česnek a zázvor nasekej a osmahni.", 5], ["Přidej kari pastu, čočku, rajčata, kokosové mléko a 500 ml vody."], ["Vař doměkka za občasného míchání.", 20], ["Mezitím vař rýži.", 15], ["Na konci vmíchej špenát, dochuť citronem a solí."]] },
  { id: "kruti-bulgur-bowl", name: "Krůtí bowl s bulgurem a hummusem", d: "Středomořský oběd do krabičky, nenudí ani třetí den.", types: ["lunch"], serv: 3, prep: 15, cook: 20, batch: true, fridge: 4, tags: ["meal-prep"], e: "🥙", items: [["kruti-prsa", 450], ["bulgur", 180], ["okurka", 1], ["rajcata", 250], ["hummus", 150], ["olivovy-olej", 15], ["koreni-mix", 6], ["citron", 1]], steps: [["Bulgur zalij dvojnásobkem vroucí vody a nech odstát.", 15], ["Krůtu nakrájej, okořeň a opeč na pánvi.", 10], ["Nakrájej okurku a rajčata."], ["Do krabiček rozděl bulgur, maso, zeleninu a hummus."]] },
  { id: "kureci-kari-batat", name: "Kuřecí kari s batáty a hráškem", d: "Hřejivé kari, které se dobře ohřívá.", types: ["lunch", "dinner"], serv: 4, prep: 15, cook: 30, batch: true, fridge: 4, freezer: true, tags: ["meal-prep"], e: "🍛", items: [["kureci-stehna", 600], ["batat", 500], ["hrasek", 200], ["kokosove-mleko", 400], ["kari-pasta", 50], ["cibule", 150], ["ryze-basmati", 240]], steps: [["Cibuli osmahni, přidej kari pastu.", 4], ["Přidej nakrájené kuře a opeč.", 6], ["Přidej batáty na kostky a kokosové mléko, duš.", 20], ["Mezitím vař rýži.", 15], ["Na posledních 5 minut přidej hrášek."]] },
  { id: "testoviny-boloneze-cocka", name: "Celozrnné těstoviny s masovo-čočkovým ragú", d: "Polovina masa nahrazená čočkou: víc vlákniny, stejná chuť.", types: ["lunch", "dinner"], serv: 4, prep: 10, cook: 35, batch: true, fridge: 4, freezer: true, tags: ["meal-prep"], e: "🍝", items: [["hovezi-mlete", 400], ["cocka-cervena", 120], ["rajcata-pasirovana", 700], ["mrkev", 150], ["cibule", 150], ["testoviny", 320], ["parmazan", 30]], steps: [["Cibuli a mrkev nastrouhej a osmahni.", 6], ["Přidej maso a opeč.", 6], ["Přidej čočku, rajčata a 300 ml vody, duš.", 25], ["Uvař těstoviny al dente.", 10], ["Rozděl s ragú do krabiček, posyp parmazánem."]] },
  { id: "tofu-teriyaki-bowl", name: "Teriyaki tofu bowl s edamame", d: "Rostlinný oběd plný bílkovin.", types: ["lunch", "dinner"], serv: 3, prep: 15, cook: 20, batch: true, fridge: 4, tags: ["vegetarian", "vegan", "meal-prep"], e: "🥢", items: [["tofu", 360], ["edamame", 300], ["ryze-natural", 210], ["mrkev", 200], ["sojova-omacka", 40], ["med", 15], ["zazvor", 10], ["sezam", 10]], steps: [["Vař rýži natural.", 20], ["Tofu nakrájej na kostky a opeč dozlatova.", 10], ["Přidej sójovou omáčku, med a zázvor, nech zkaramelizovat.", 3], ["Edamame spař vroucí vodou, mrkev nastrouhej."], ["Rozděl do krabiček, posyp sezamem."]] },
  { id: "dynova-polevka-cizrna", name: "Dýňová polévka s pečenou cizrnou", d: "Sezónní polévka, která zahřeje i zasytí.", types: ["lunch", "dinner"], serv: 4, prep: 15, cook: 30, batch: true, fridge: 4, freezer: true, tags: ["vegetarian", "vegan", "meal-prep", "sezona"], e: "🎃", items: [["dyne", 1], ["cibule", 100], ["kokosove-mleko", 200], ["cizrna", 480], ["zazvor", 10], ["koreni-mix", 5], ["lneny-dyne-seminka", 30], ["zitny-chleb", 200]], steps: [["Dýni nakrájej (hokkaido se neloupe), cibuli osmahni."], ["Přidej dýni, zázvor a 1 l vody, vař doměkka.", 20], ["Cizrnu okořeň a peč v troubě na 200 °C.", 20], ["Polévku rozmixuj s kokosovým mlékem."], ["Podávej s cizrnou, semínky a chlebem."]] },
  // Večeře
  { id: "losos-batat-listy", name: "Losos, batáty a zelené listy", d: "Omega-3 večeře za 25 minut, většinu dělá trouba.", types: ["dinner"], serv: 1, prep: 5, cook: 20, tags: [], e: "🐟", fav: true, items: [["losos", 150], ["batat", 200], ["salat-mix", 60], ["olivovy-olej", 8], ["citron", 0.5]], steps: [["Batáty nakrájej na měsíčky, potři olejem a peč na 210 °C.", 20], ["Po 10 minutách přidej na plech lososa.", 10], ["Podávej s listy a citronem."]] },
  { id: "treska-brambory-fazolky", name: "Treska, šťouchané brambory a fazolky", d: "Lehká bílá ryba s českou přílohou.", types: ["dinner"], serv: 1, prep: 5, cook: 20, tags: [], e: "🐟", items: [["treska", 200], ["brambory", 250], ["zeleni-fazolky", 150], ["maslo", 8], ["citron", 0.5]], steps: [["Brambory vař doměkka.", 18], ["Tresku osol a opeč na pánvi z obou stran.", 8], ["Fazolky povař 5 minut.", 5], ["Brambory šťouchni s máslem."]] },
  { id: "halloumi-salat", name: "Halloumi salát s quinoou a řepou", d: "Barevný salát, který zasytí.", types: ["dinner", "lunch"], serv: 1, prep: 10, cook: 15, tags: ["vegetarian"], e: "🥗", items: [["halloumi", 80], ["quinoa", 50], ["cervena-repa", 100], ["rukola", 40], ["vlasske-orechy", 10], ["olivovy-olej", 8]], steps: [["Quinou propláchni a vař.", 15], ["Halloumi nakrájej a opeč dozlatova.", 4], ["Smíchej s rukolou, řepou, ořechy a olejem."]] },
  { id: "kureci-wrap", name: "Kuřecí wrap s jogurtovým dresinkem", d: "Rychlá večeře nebo oběd s sebou.", types: ["dinner", "lunch"], serv: 1, prep: 8, cook: 8, tags: [], e: "🌯", items: [["kureci-prsa", 130], ["tortilla", 2], ["salat-mix", 40], ["rajcata", 60], ["recky-jogurt", 60], ["koreni-mix", 3]], steps: [["Kuře nakrájej na nudličky, okořeň a opeč.", 8], ["Jogurt smíchej se solí a česnekem."], ["Tortilly naplň salátem, rajčaty, kuřetem a dresinkem."]] },
  { id: "hovezi-bowl", name: "Hovězí bowl s rýží a zeleninou", d: "Restaurantní bowl doma za 20 minut.", types: ["dinner", "lunch"], serv: 1, prep: 8, cook: 12, tags: [], e: "🥩", items: [["hovezi-kyta", 150], ["ryze-basmati", 70], ["brokolice", 120], ["mrkev", 60], ["sojova-omacka", 15], ["sezam", 5]], steps: [["Vař rýži.", 12], ["Hovězí nakrájej na tenké plátky a prudce orestuj.", 4], ["Přidej brokolici a mrkev, podlij sójovou omáčkou.", 5], ["Podávej na rýži se sezamem."]] },
  { id: "krevety-cuketove-testoviny", name: "Krevety s cuketou a celozrnnými těstovinami", d: "Lehké, svěží a rychlé.", types: ["dinner"], serv: 1, prep: 5, cook: 12, tags: [], e: "🦐", items: [["krevety", 150], ["testoviny", 70], ["cuketa", 0.5], ["cesnek", 5], ["olivovy-olej", 10], ["citron", 0.5], ["parmazan", 10]], steps: [["Uvař těstoviny.", 10], ["Na oleji orestuj česnek a cuketu.", 4], ["Přidej krevety, opékej do růžova.", 3], ["Smíchej s těstovinami, citronem a parmazánem."]] },
  { id: "panenka-brambory-salat", name: "Vepřová panenka, pečené brambory a salát", d: "Nedělní večeře bez pocitu těžkosti.", types: ["dinner"], serv: 2, prep: 10, cook: 30, tags: [], e: "🥩", items: [["veprova-panenka", 350], ["brambory", 500], ["salat-mix", 80], ["horcice", 15], ["olivovy-olej", 15]], steps: [["Brambory nakrájej, potři olejem a peč na 200 °C.", 30], ["Panenku potři hořčicí a opeč ze všech stran.", 6], ["Dopeč panenku v troubě s bramborami.", 12], ["Nech odpočinout, nakrájej a podávej se salátem."]] },
  { id: "tofu-zelenina-wok", name: "Wok tofu se zeleninou a rýžovými nudlemi", d: "Rostlinná večeře z mražené zeleniny.", types: ["dinner"], serv: 1, prep: 5, cook: 10, tags: ["vegetarian", "vegan"], e: "🥢", items: [["tofu", 150], ["zelenina-mix-mrazena", 200], ["ryze-basmati", 60], ["sojova-omacka", 15], ["zazvor", 5], ["arasidove-maslo", 10]], steps: [["Vař rýži.", 12], ["Tofu opeč dozlatova.", 6], ["Přidej mraženou zeleninu, zázvor a sójovou omáčku.", 5], ["Vmíchej arašídové máslo rozředěné vodou."]] },
  { id: "zampionove-rizoto", name: "Žampionové rizoto s parmazánem a hráškem", d: "Krémové, ale ne těžké.", types: ["dinner"], serv: 2, prep: 10, cook: 25, tags: ["vegetarian"], e: "🍄", items: [["ryze-natural", 150], ["zampiony", 250], ["hrasek", 150], ["cibule", 80], ["parmazan", 30], ["olivovy-olej", 10], ["cottage", 100]], steps: [["Cibuli a žampiony osmahni.", 6], ["Přidej rýži a postupně podlévej vodou / vývarem.", 25], ["Na konci vmíchej hrášek, cottage a parmazán."]] },
  { id: "tunakovy-salat", name: "Tuňákový salát s fazolemi a vejcem", d: "Bez vaření z toho, co je ve spíži.", types: ["dinner", "lunch"], serv: 1, prep: 8, cook: 7, tags: ["low-carb"], e: "🥗", items: [["tunak", 120], ["fazole-cerne", 120], ["vejce", 1], ["salat-mix", 60], ["rajcata", 80], ["olivovy-olej", 8], ["citron", 0.5]], steps: [["Uvař vejce natvrdo.", 8], ["Smíchej salát, rajčata, fazole a tuňák."], ["Přidej vejce, olej a citron."]] },
  { id: "kapusta-cizrna-panev", name: "Pánev s kapustou, cizrnou a vejcem", d: "Zimní zelenina, která chutná i dětem.", types: ["dinner"], serv: 1, prep: 5, cook: 12, tags: ["vegetarian"], e: "🥬", items: [["kapusta", 100], ["cizrna", 120], ["vejce", 2], ["cibule", 50], ["olivovy-olej", 8], ["koreni-mix", 3], ["zitny-chleb", 50]], steps: [["Cibuli osmahni, přidej cizrnu a koření.", 5], ["Přidej kapustu a krátce poduš.", 4], ["Udělej důlky a rozklepni vejce, přiklop.", 4], ["Podávej s chlebem."]] },
  // Svačiny
  { id: "skyr-banan-arasidy", name: "Skyr s banánem a arašídovým máslem", d: "Svačina, která dorovná bílkoviny.", types: ["snack", "snack_am"], serv: 1, prep: 2, cook: 0, tags: ["vegetarian", "rychle"], e: "🍌", items: [["skyr", 200], ["banan", 1], ["arasidove-maslo", 15]], steps: [["Skyr dej do misky, přidej banán a arašídové máslo."]] },
  { id: "cottage-zelenina", name: "Cottage s paprikou a žitným chlebem", d: "Slaná svačina, lehká a sytá.", types: ["snack", "snack_am", "breakfast"], serv: 1, prep: 4, cook: 0, tags: ["vegetarian", "rychle"], e: "🫑", items: [["cottage", 180], ["paprika", 0.5], ["zitny-chleb", 50]], steps: [["Papriku nakrájej, podávej s cottage a chlebem."]] },
  { id: "proteinovy-koktejl", name: "Proteinový koktejl s ovocem", d: "Po tréninku nebo když spěcháš.", types: ["snack", "snack_am"], serv: 1, prep: 3, cook: 0, tags: ["vegetarian", "rychle"], e: "🥤", items: [["protein-whey", 30], ["mleko", 250], ["lesni-ovoce", 80]], steps: [["Vše rozmixuj dohladka."]] },
  { id: "jablko-orechy", name: "Jablko, ořechy a kousek čokolády", d: "Malá sladká tečka.", types: ["snack", "snack_am"], serv: 1, prep: 1, cook: 0, tags: ["vegetarian", "vegan", "rychle"], e: "🍎", items: [["jablko", 1], ["vlasske-orechy", 15], ["tmava-cokolada", 10]], steps: [["Nakrájej jablko a dej k němu ořechy a čokoládu."]] },
  { id: "hummus-mrkev", name: "Hummus s mrkví a okurkou", d: "Křupavá rostlinná svačina.", types: ["snack", "snack_am"], serv: 1, prep: 4, cook: 0, tags: ["vegetarian", "vegan", "rychle"], e: "🥕", items: [["hummus", 80], ["mrkev", 100], ["okurka", 0.3]], steps: [["Zeleninu nakrájej na hranolky a podávej s hummusem."]] },
  { id: "tvaroh-ovoce", name: "Tvaroh s ovocem a skořicí", d: "Pomalé bílkoviny na večer.", types: ["snack"], serv: 1, prep: 2, cook: 0, tags: ["vegetarian", "rychle"], e: "🍐", items: [["tvaroh", 200], ["hruska", 1], ["med", 5]], steps: [["Tvaroh rozmíchej s medem, přidej nakrájenou hrušku a skořici."]] },
];

export const DEFAULT_REMINDERS = [
  { id: "plan", label: "Ranní přehled dne", time: "07:00" },
  { id: "meal", label: "Připomenutí jídel podle plánu", time: "slot" },
  { id: "expiry", label: "Co dnes spotřebovat", time: "17:00" },
  { id: "prep", label: "Meal prep den", time: "07:00" },
  { id: "weigh", label: "Ranní vážení (trend, ne známka)", time: "07:00" },
  { id: "shopping", label: "Nákup na další dny", time: "17:00" },
  { id: "checkin", label: "Týdenní check-in", time: "17:00" },
];
