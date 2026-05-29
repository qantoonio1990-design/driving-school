#!/usr/bin/env python3
"""Сохраняет учебную сессию тренажёра в sessions/ с единообразным именем.

Детерминированная часть процесса (Правило 5 устава: «можно кодом — делай кодом»):
вместо того чтобы каждый раз вручную придумывать путь и имя файла, вызови этот
скрипт. Тело сессии (транскрипт + разбор в Markdown) подаётся на stdin.

Пример:
    cat session.md | python3 tools/save_session.py --name "Лена" --topic "расставание"
    python3 tools/save_session.py --name "Андрей" --topic "выгорание" --date 2026-06-01 < body.md

Имя файла: sessions/ГГГГ-ММ-ДД-<имя>-<тема>.md (транслитерация, нижний регистр).
Печатает путь сохранённого файла.
"""
import argparse
import datetime as dt
import re
import sys
from pathlib import Path

# Карта транслитерации кириллицы для аккуратных имён файлов.
TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "",
    "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def slugify(text: str) -> str:
    text = text.strip().lower()
    out = "".join(TRANSLIT.get(ch, ch) for ch in text)
    out = re.sub(r"[^a-z0-9]+", "-", out)
    return out.strip("-")


def main() -> int:
    p = argparse.ArgumentParser(description="Сохранить учебную сессию тренажёра.")
    p.add_argument("--name", required=True, help="Имя клиента из кейса (напр. Лена).")
    p.add_argument("--topic", required=True, help="Короткая тема (напр. расставание).")
    p.add_argument("--date", help="Дата ГГГГ-ММ-ДД (по умолчанию сегодня).")
    args = p.parse_args()

    body = sys.stdin.read()
    if not body.strip():
        print("Ошибка: тело сессии пустое (подай Markdown на stdin).", file=sys.stderr)
        return 1

    date = args.date or dt.date.today().isoformat()
    slug = f"{date}-{slugify(args.name)}-{slugify(args.topic)}"

    # sessions/ лежит рядом со скиллом: tools/ -> .. -> sessions/
    sessions_dir = Path(__file__).resolve().parent.parent / "sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    path = sessions_dir / f"{slug}.md"

    path.write_text(body, encoding="utf-8")
    print(str(path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
