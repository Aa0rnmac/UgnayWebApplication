from __future__ import annotations


WORD_TAGALOG_MAP: dict[str, str] = {
    "GOOD MORNING": "MAGANDANG ARAW",
    "GOOD AFTERNOON": "MAGANDANG HAPON",
    "GOOD EVENING": "MAGANDANG GABI",
    "HELLO": "KUMUSTA",
    "HOW ARE YOU": "KAMUSTA KA",
    "THANK YOU": "SALAMAT",
    "YOU'RE WELCOME": "WALANG ANUMAN",
    "SEE YOU TOMORROW": "KITA TAYO BUKAS",
    "YES": "OO",
    "NO": "HINDI",
    "UNDERSTAND": "NAIINTINDIHAN",
    "DON'T KNOW": "HINDI ALAM",
    "SLOW": "MABAGAL",
    "TODAY": "NGAYON",
    "TOMORROW": "BUKAS",
    "YESTERDAY": "KAHAPON",
    "MONDAY": "LUNES",
    "TUESDAY": "MARTES",
    "WEDNESDAY": "MIYERKULES",
    "THURSDAY": "HUWEBES",
    "FRIDAY": "BIYERNES",
    "SATURDAY": "SABADO",
    "SUNDAY": "LINGGO",
    "FATHER": "AMA",
    "MOTHER": "INA",
    "PARENTS": "MGA MAGULANG",
    "SON": "ANAK NA LALAKI",
    "DAUGHTER": "ANAK NA BABAE",
    "BROTHER": "KAPATID NA LALAKI",
    "SISTER": "KAPATID NA BABAE",
    "COUSIN": "PINSAN",
    "GRANDFATHER": "LOLO",
    "GRANDMOTHER": "LOLA",
    "HUSBAND": "ASAWA",
    "WIFE": "ASAWA",
    "BOY": "LALAKI",
    "GIRL": "BABAE",
    "DEAF": "BINGI",
    "BLIND": "BULAG",
    "MARRIED": "MAY ASAWA",
    "SINGLE": "WALANG ASAWA",
    "BLUE": "ASUL",
    "GREEN": "BERDE",
    "RED": "PULA",
    "YELLOW": "DILAW",
    "PINK": "ROSAS",
    "VIOLET": "UBE",
    "BLACK": "ITIM",
    "WHITE": "PUTI",
    "LIGHT": "MALIWANAG",
    "DARK": "MADILIM",
}

TAGALOG_TO_WORD_MAP: dict[str, str] = {
    value: key for key, value in WORD_TAGALOG_MAP.items()
}


def normalize_word_label(value: str | None) -> str:
    if not value:
        return ""
    normalized = value.replace("’", "'").replace("`", "'")
    normalized = " ".join(normalized.strip().upper().split())
    return normalized


def localize_word_label(value: str | None) -> str:
    normalized = normalize_word_label(value)
    if not normalized:
        return ""
    if normalized in {"UNSURE", "NO PREDICTION YET."}:
        return normalized
    return WORD_TAGALOG_MAP.get(normalized, normalized)


def canonicalize_word_label(value: str | None) -> str:
    normalized = normalize_word_label(value)
    if not normalized:
        return ""
    return TAGALOG_TO_WORD_MAP.get(normalized, normalized)

