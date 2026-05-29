#!/usr/bin/env node
/**
 * Пример работы с SStats.net Football API.
 *
 * SStats.net — бесплатный REST API футбольной статистики: матчи, коэффициенты,
 * составы, события, рейтинги Glicko 2 и xG (ожидаемые голы). Данные в JSON/CSV.
 *
 * Базовый URL:   https://api.sstats.net
 * Авторизация:   query-параметр ?apikey=<ВАШ_КЛЮЧ>
 * Лимиты:        без ключа — 300 запросов/мин на всех + 30/мин на 1 IP;
 *                с ключом лимит выше (ключ берётся в личном кабинете /profile).
 * Документация:  https://sstats.net/api  и  https://sstats.net/openapi/v1.json
 *
 * Ключ читается из переменной окружения SSTATS_API_KEY (секрет не хранится в коде):
 *   SSTATS_API_KEY=ваш_ключ node sstats-example.mjs
 */

const BASE_URL = "https://api.sstats.net";
const API_KEY = process.env.SSTATS_API_KEY;

if (!API_KEY) {
  console.error("Не задан SSTATS_API_KEY. Запуск: SSTATS_API_KEY=ваш_ключ node sstats-example.mjs");
  process.exit(1);
}

/** Выполняет GET-запрос к API, добавляя apikey и параметры запроса. */
async function api(path, params = {}) {
  const url = new URL(BASE_URL + path);
  url.searchParams.set("apikey", API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} для ${path}`);
  }
  const body = await res.json();
  if (body.status && body.status !== "OK") {
    throw new Error(`API status=${body.status} для ${path}`);
  }
  return body;
}

const line = (s = "") => console.log(s);
const header = (s) => line(`\n=== ${s} ===`);

async function main() {
  // 1. Информация об аккаунте — проверяем, что ключ валиден.
  header("Аккаунт");
  const account = await api("/Account/Info");
  line(`Пользователь: ${account.data.userName}`);
  line(`API ключ:     ${account.data.apiKey}`);

  // 2. Список лиг (берём первые несколько для примера).
  header("Лиги (первые 5)");
  const leagues = await api("/Leagues");
  for (const lg of leagues.data.slice(0, 5)) {
    line(`#${lg.id}  ${lg.name} (${lg.country?.name ?? "—"})`);
  }
  line(`Всего лиг: ${leagues.data.length}`);

  // 3. Матчи за сегодня (фильтр today=true).
  header("Матчи за сегодня (первые 5)");
  const today = await api("/Games/list", { today: true });
  line(`Всего матчей сегодня: ${today.count ?? today.data.length}`);
  for (const g of today.data.slice(0, 5)) {
    const score =
      g.homeResult != null && g.awayResult != null
        ? `${g.homeResult}:${g.awayResult}`
        : "—:—";
    line(
      `${g.date}  ${g.homeTeam?.name} ${score} ${g.awayTeam?.name}  [${g.statusName}]`
    );
  }

  // 4. Подробные данные конкретного матча.
  const gameId = 1183255; // CRB vs Avai, Serie B (пример из документации)
  header(`Данные матча #${gameId}`);
  const game = (await api(`/Games/${gameId}`)).data.game;
  line(`${game.homeTeam.name} ${game.homeFTResult}:${game.awayFTResult} ${game.awayTeam.name}`);
  line(`Лига: ${game.season.league.name} (${game.season.league.country.name}), сезон ${game.season.year}`);
  line(`Статус: ${game.statusName}, дата: ${game.date}`);

  // 5. Прогноз Glicko 2 + xG (ожидаемые голы) для того же матча.
  header(`Прогноз Glicko 2 / xG для матча #${gameId}`);
  const gl = (await api(`/Games/glicko/${gameId}`)).data.glicko;
  const pct = (x) => (x * 100).toFixed(1) + "%";
  line(`Рейтинг хозяев:  ${gl.homeRating.toFixed(1)}  (xG ${gl.homeXg.toFixed(2)})`);
  line(`Рейтинг гостей:  ${gl.awayRating.toFixed(1)}  (xG ${gl.awayXg.toFixed(2)})`);
  line(`P(победа хозяев): ${pct(gl.homeWinProbability)}`);
  line(`P(победа гостей): ${pct(gl.awayWinProbability)}`);
  line(`P(ничья):         ${pct(1 - gl.homeWinProbability - gl.awayWinProbability)}`);

  line("\nГотово. Полный список методов: https://sstats.net/openapi/v1.json");
}

main().catch((err) => {
  console.error("Ошибка:", err.message);
  process.exit(1);
});
