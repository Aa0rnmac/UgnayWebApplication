const WORD_TAGALOG_MAP: Record<string, string> = {
  "GOOD MORNING": "MAGANDANG ARAW",
  "GOOD AFTERNOON": "MAGANDANG HAPON",
  "GOOD EVENING": "MAGANDANG GABI",
  HELLO: "KUMUSTA",
  "HOW ARE YOU": "KAMUSTA KA",
  "THANK YOU": "SALAMAT",
  "YOU'RE WELCOME": "WALANG ANUMAN",
  "SEE YOU TOMORROW": "KITA TAYO BUKAS",
  YES: "OO",
  NO: "HINDI",
  UNDERSTAND: "NAIINTINDIHAN",
  "DON'T KNOW": "HINDI ALAM",
  SLOW: "MABAGAL",
  TODAY: "NGAYON",
  TOMORROW: "BUKAS",
  YESTERDAY: "KAHAPON",
  MONDAY: "LUNES",
  TUESDAY: "MARTES",
  WEDNESDAY: "MIYERKULES",
  THURSDAY: "HUWEBES",
  FRIDAY: "BIYERNES",
  SATURDAY: "SABADO",
  SUNDAY: "LINGGO",
  FATHER: "AMA",
  MOTHER: "INA",
  PARENTS: "MGA MAGULANG",
  SON: "ANAK NA LALAKI",
  DAUGHTER: "ANAK NA BABAE",
  BROTHER: "KAPATID NA LALAKI",
  SISTER: "KAPATID NA BABAE",
  COUSIN: "PINSAN",
  GRANDFATHER: "LOLO",
  GRANDMOTHER: "LOLA",
  HUSBAND: "ASAWA",
  WIFE: "ASAWA",
  BOY: "LALAKI",
  GIRL: "BABAE",
  DEAF: "BINGI",
  BLIND: "BULAG",
  MARRIED: "MAY ASAWA",
  SINGLE: "WALANG ASAWA",
  BLUE: "ASUL",
  GREEN: "BERDE",
  RED: "PULA",
  YELLOW: "DILAW",
  PINK: "ROSAS",
  VIOLET: "UBE",
  BLACK: "ITIM",
  WHITE: "PUTI",
  LIGHT: "MALIWANAG",
  DARK: "MADILIM",
};

const TAGALOG_WORD_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(WORD_TAGALOG_MAP).map(([english, filipino]) => [filipino, english])
);

function normalizeWordLabel(value: string): string {
  return value.replace(/\u2019/g, "'").replace(/`/g, "'").trim().replace(/\s+/g, " ").toUpperCase();
}

export function canonicalizeWordLabel(value: string): string {
  const normalized = normalizeWordLabel(value);
  if (!normalized) {
    return "";
  }
  return TAGALOG_WORD_MAP[normalized] ?? normalized;
}

export function localizeWordLabel(value: string): string {
  const normalized = normalizeWordLabel(value);
  if (!normalized || normalized === "UNSURE" || normalized === "NO PREDICTION YET.") {
    return value;
  }
  return WORD_TAGALOG_MAP[normalized] ?? value;
}

export function localizeWordLabels(values: string[]): string[] {
  return values.map((value) => localizeWordLabel(value));
}

export type WordDisplayLanguage = "english" | "filipino";

export function displayWordLabel(value: string, language: WordDisplayLanguage): string {
  if (language === "english") {
    const canonical = canonicalizeWordLabel(value);
    return canonical || value;
  }
  return localizeWordLabel(value);
}

export function displayWordLabels(values: string[], language: WordDisplayLanguage): string[] {
  return values.map((value) => displayWordLabel(value, language));
}

