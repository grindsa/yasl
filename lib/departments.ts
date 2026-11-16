/**
 * Supermarket aisle / department helpers for shopping-list walk order.
 */

export const DEPARTMENT_IDS = [
  "produce",
  "bakery",
  "dairy_chilled",
  "meat_fish",
  "frozen",
  "pantry",
  "beverages",
  "snacks",
  "household_drugstore",
  "other",
] as const;

export type DepartmentId = (typeof DEPARTMENT_IDS)[number];

export type DepartmentSource = "rule" | "off" | "user";

export const DEPARTMENT_LABELS: Record<DepartmentId, string> = {
  produce: "Obst & Gemüse",
  bakery: "Brot & Backwaren",
  dairy_chilled: "Kühlung",
  meat_fish: "Fleisch & Fisch",
  frozen: "Tiefkühl",
  pantry: "Trockenware",
  beverages: "Getränke",
  snacks: "Süßes & Snacks",
  household_drugstore: "Haushalt & Drogerie",
  other: "Sonstiges",
};

export function isDepartmentId(value: unknown): value is DepartmentId {
  return (
    typeof value === "string" &&
    (DEPARTMENT_IDS as readonly string[]).includes(value)
  );
}

export function departmentSortIndex(id: DepartmentId): number {
  return DEPARTMENT_IDS.indexOf(id);
}

/** Keyword → department (first match wins). Longer / more specific phrases first. */
const NAME_RULES: { pattern: RegExp; department: DepartmentId }[] = [
  // Produce
  {
    pattern:
      /\b(obst|gemüse|apfel|äpfel|birne|banane|orange|zitrone|limette|traube|beere|erdbeer|himbeer|blaubeer|brombeer|kirsche|pfirsich|nektarine|pflaume|mango|ananas|melone|kiwi|avocado|tomate|gurke|paprika|zucchini|aubergine|karotte|möhre|kartoffel|zwiebel|knoblauch|lauch|sellerie|spinat|salat|rucola|kraut|broccoli|blumenkohl|champignon|pilz|kräuter|petersilie|basilikum|schnittlauch)\b/i,
    department: "produce",
  },
  // Bakery
  {
    pattern:
      /\b(brot|brötchen|semmel|croissant|baguette|toast|brezel|breze|ciabatta|vollkornbrot|knäcke|backware)\b/i,
    department: "bakery",
  },
  // Dairy / chilled
  {
    pattern:
      /\b(milch|butter|käse|joghurt|jogurt|quark|sahne|schmand|creme fraiche|crème fraîche|margarine|eier|ei\b|skyr|frischkäse|mozzarella|feta|gouda|schnittkäse|h-milch|laktosefrei)\b/i,
    department: "dairy_chilled",
  },
  // Meat & fish
  {
    pattern:
      /\b(fleisch|hackfleisch|wurst|würstchen|salami|schinken|speck|hähnchen|huhn|pute|truthahn|schwein|rind|lamm|filet|schnitzel|fisch|lachs|thunfisch|forelle|garnele|meeresfrüchte|aufschnitt)\b/i,
    department: "meat_fish",
  },
  // Frozen
  {
    pattern:
      /\b(tiefkühl|tk[- ]|eiscreme|eis\b|frozen|pizza tk|spinat tk|pommes)\b/i,
    department: "frozen",
  },
  // Beverages
  {
    pattern:
      /\b(wasser|sprudel|saft|cola|limonade|limo|tee\b|kaffee|espresso|kakao|bier|wein|sekt|schorle|energy.?drink|getränk)\b/i,
    department: "beverages",
  },
  // Snacks / sweets
  {
    pattern:
      /\b(schokolade|schoko|chips|gummi|bonbon|kekse|keks|cookie|riegel|süßigkeit|nassfutter|knabber|popcorn|nüsse|mandel|cashew|erdnuss)\b/i,
    department: "snacks",
  },
  // Household / drugstore
  {
    pattern:
      /\b(spül|waschmittel|weichspüler|putz|reiniger|müllbeutel|klopapier|toilettenpapier|küchenrolle|seife|shampoo|duschgel|zahnpasta|zahnbürste|deo|bindenh|tampon|windel|kosmetik|drogerie|allzweck|geschirrspül)\b/i,
    department: "household_drugstore",
  },
  // Pantry (dry goods) — after more specific rules
  {
    pattern:
      /\b(nudeln|pasta|reis|mehl|zucker|salz|öl|essig|soße|sauce|ketchup|senf|mayo|marmelade|honig|müsli|hafer|cornflakes|konserve|dose|bohnen|lins|kicher|tomatenmark|brühe|gewürz|pfeffer|hefe|backpulver|paniermehl|couscous|bulgur|tortilla|wrap)\b/i,
    department: "pantry",
  },
];

/** Open Food Facts category tags (en:…) → department. First match wins. */
const OFF_TAG_RULES: { pattern: RegExp; department: DepartmentId }[] = [
  {
    pattern:
      /en:(fruits|vegetables|fresh-fruits|fresh-vegetables|herbs|salads)/i,
    department: "produce",
  },
  {
    pattern: /en:(breads|buns|pastries|bakery|croissants)/i,
    department: "bakery",
  },
  {
    pattern:
      /en:(dairies|milks|yogurts|cheeses|butters|creams|eggs|plant-based-milk)/i,
    department: "dairy_chilled",
  },
  {
    pattern:
      /en:(meats|fresh-meats|poultries|sausages|hams|fishes|seafoods|seafood)/i,
    department: "meat_fish",
  },
  {
    pattern: /en:(frozen-foods|ice-creams|frozen)/i,
    department: "frozen",
  },
  {
    pattern:
      /en:(beverages|waters|sodas|juices|teas|coffees|beers|wines|plant-based-beverages)/i,
    department: "beverages",
  },
  {
    pattern:
      /en:(snacks|sweet-snacks|salty-snacks|chocolates|candies|cookies|chips)/i,
    department: "snacks",
  },
  {
    pattern:
      /en:(cleaning|personal-care|hygiene|baby-foods|pet-food)/i,
    department: "household_drugstore",
  },
  {
    pattern:
      /en:(plant-based-foods|cereals|pastas|rices|sauces|condiments|spreads|canned|groceries)/i,
    department: "pantry",
  },
];

export function classifyByName(name: string): DepartmentId {
  const normalized = name.trim();
  if (!normalized) return "other";
  for (const rule of NAME_RULES) {
    if (rule.pattern.test(normalized)) return rule.department;
  }
  return "other";
}

export function classifyFromOffTags(
  tags: string[] | undefined | null,
): DepartmentId | null {
  if (!tags?.length) return null;
  const joined = tags.join(" ");
  for (const rule of OFF_TAG_RULES) {
    if (rule.pattern.test(joined)) return rule.department;
  }
  return null;
}

export function classifyItem(input: {
  name: string;
  offTags?: string[] | null;
}): { department: DepartmentId; source: DepartmentSource } {
  const fromOff = classifyFromOffTags(input.offTags);
  if (fromOff && fromOff !== "other") {
    return { department: fromOff, source: "off" };
  }
  const fromName = classifyByName(input.name);
  return {
    department: fromName,
    source: fromName === "other" && !fromOff ? "rule" : fromOff ? "off" : "rule",
  };
}
