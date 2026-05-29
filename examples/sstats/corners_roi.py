#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Считает результат стратегии 'ТБ 8.5 угловых' по матчам бота через SStats.net API.
Выигрыш ставки = в матче 9+ угловых (cornerKicksHome+Away >= 9).
"""
import json, os, sys, time, unicodedata, urllib.parse, urllib.request

API = "https://api.sstats.net"
KEY = os.environ["SSTATS_API_KEY"]

# (home, away, date) — все ставки из бота, линия ТБ 8.5
BETS = [
    ("Szeged-Csanád II", "Martfűi LSE", "2026-05-16"),
    ("Dong Thap", "Long An", "2026-05-16"),
    ("Dianella White Eagle", "Balcatta", "2026-05-16"),
    ("Krylya Sovetov W", "Zvezda Perm W", "2026-05-16"),
    ("Partizán Bardejov W", "Petržalka W", "2026-05-16"),
    ("Atlètic Club d'Escaldes", "Penya Encarnada", "2026-05-17"),
    ("Paksi SE II", "Majosi", "2026-05-17"),
    ("Kisvárda II", "Cigand SE", "2026-05-17"),
    ("Krylya Sovetov II", "Orenburg II", "2026-05-18"),
    ("Jwaaya FC", "Al Hikma", "2026-05-18"),
    ("Thimphu City", "Drukpa", "2026-05-18"),
    ("RTC", "Paro", "2026-05-19"),
    ("Tajikistan U20", "Kyrgyz Republic U20", "2026-05-19"),
    ("Mbarara City", "Buhimba Saints", "2026-05-19"),
    ("Hunters", "Ulaanbaatar", "2026-05-20"),
    ("Benfica U23", "Santa Clara U23", "2026-05-20"),
    ("Tuloy", "Maharlika", "2026-05-20"),
    ("Mines", "ZESCO United", "2026-05-20"),
    ("Avangard Kursk", "Metallurg Lipetsk", "2026-05-20"),
    ("Gareji", "Merani Martvili", "2026-05-20"),
    ("Legia Warszawa II", "Widzew II", "2026-05-21"),
    ("Ekibastuz", "Akademiya Ontustik", "2026-05-21"),
    ("Ulaangom City", "Khovd", "2026-05-21"),
    ("Ugyen Academy", "Tsirang", "2026-05-21"),
    ("Aktobe Jas", "Yelimay Semey 2", "2026-05-21"),
    ("Germaneya", "Pirin Razlog", "2026-05-21"),
    ("Sport Academy Kairat", "Turan Turkistan", "2026-05-21"),
    ("Shakhtar Donetsk U19", "Kolos Kovalivka U19", "2026-05-22"),
    ("Zhytomyr U19", "Rukh Vynnyky U19", "2026-05-22"),
    ("Veres Rivne U19", "Metalist 1925 U19", "2026-05-22"),
    ("Dynamo Kyiv U19", "Kudrivka U19", "2026-05-22"),
    ("Epitsentr U19", "SK Poltava U19", "2026-05-22"),
    ("Ho Chi Minh", "Bình Phước", "2026-05-22"),
    ("Box Hill", "Springvale", "2026-05-22"),
    ("Kingston City", "Werribee City", "2026-05-22"),
]

def get(path, **params):
    params["apikey"] = KEY
    url = API + path + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        except Exception as e:
            if attempt == 3: raise
            time.sleep(2 * (attempt + 1))

def norm(s):
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(s.lower().replace(".", " ").replace("-", " ").split())

def team_match(bet_name, api_name):
    a, b = norm(bet_name), norm(api_name)
    if a == b: return True
    return a in b or b in a

# 1. Грузим все матчи по нужным датам (с пагинацией)
dates = sorted({d for _, _, d in BETS})
games_by_date = {}
for d in dates:
    games, offset = [], 0
    while True:
        resp = get("/Games/list", Date=d, Limit=1000, Offset=offset)
        chunk = resp.get("data", [])
        games.extend(chunk)
        if len(chunk) < 1000: break
        offset += 1000
    games_by_date[d] = games
    print(f"  {d}: загружено {len(games)} матчей", file=sys.stderr)

# 2. Сопоставляем ставки с матчами, тянем угловые
rows = []
for home, away, d in BETS:
    cand = [g for g in games_by_date[d]
            if team_match(home, g["homeTeam"]["name"]) and team_match(away, g["awayTeam"]["name"])]
    if not cand:
        rows.append((home, away, d, None, None, None, "НЕ НАЙДЕН"))
        continue
    g = cand[0]
    det = get(f"/Games/{g['id']}")
    st = (det.get("data", {}) or {}).get("statistics") or {}
    ch, ca = st.get("cornerKicksHome"), st.get("cornerKicksAway")
    status = g.get("statusName")
    if ch is None or ca is None:
        rows.append((home, away, d, g["id"], None, status, "НЕТ УГЛОВЫХ"))
    else:
        rows.append((home, away, d, g["id"], ch + ca, status, "OK"))

# 3. Результат и ROI
print("\n%-26s %-22s %-11s %6s %7s  %s" % ("Дом", "Гости", "Дата", "Угл.", "Исход", "Прим."))
print("-" * 95)
graded = []
for home, away, d, gid, total, status, note in rows:
    res = ""
    if note == "OK":
        res = "ВЫИГРЫШ" if total >= 9 else "ПРОИГРЫШ"
        graded.append(total >= 9)
    print("%-26.26s %-22.22s %-11s %6s %8s  %s" %
          (home, away, d, total if total is not None else "-", res or "-",
           note if note != "OK" else status))

n = len(graded)
wins = sum(graded)
print("\n=== ИТОГО (ТБ 8.5 угловых, выигрыш = 9+ угловых) ===")
print(f"Ставок рассчитано: {n} из {len(BETS)}  (не найдено/без статы: {len(BETS)-n})")
if n:
    wr = wins / n
    print(f"Выигрышей: {wins}  | Проигрышей: {n-wins}  | Win-rate: {wr*100:.1f}%")
    print("\nROI при флэт-ставке 1 ед. и разных коэффициентах на ТБ8.5:")
    for odds in (1.80, 1.85, 1.90, 2.00):
        profit = wins * (odds - 1) - (n - wins)
        print(f"  коэф {odds:.2f}:  прибыль {profit:+.2f} ед.  ROI {profit/n*100:+.1f}%  "
              f"(точка безубытка коэф = {1/wr:.2f})")
