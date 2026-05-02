# Distance Compensation QA

Этот чеклист нужен для ручной проверки distance-based compensation estimate в `claim-flow`, `submit-claim`, клиентском кабинете и админке.

## Preconditions

Перед тестированием должны быть применены и задеплоены:

- `supabase/sql/021_distance_compensation_estimate.sql`
- обновленный `submit-claim` Edge Function
- frontend с compensation preview в `claim-flow`

Также в `public.airports` должны существовать корректные записи с `latitude_deg` и `longitude_deg` для тестовых маршрутов.

## Общие ожидаемые правила

- `<= 1500 km` -> `short` -> `up to €250`
- `> 1500 km and <= 3500 km` -> `medium` -> `up to €400`
- `> 3500 km` -> `long` -> `up to €600`
- если координаты недоступны или `airport_id` отсутствует:
  - submit не должен падать
  - `estimate_status` должен быть `pending_review`
  - `distance_band` должен быть `unknown`

## Test 1 — RIX -> LHR returns medium band and up to EUR 400

### Steps

1. Открыть `/:lang/claim/eligibility`
2. Выбрать `RIX` как departure airport
3. Выбрать `LHR` как destination airport
4. Пройти flow до конца и отправить claim

### Expected UI result

- в eligibility preview должно быть:
  - маршрут `RIX -> LHR`
  - примерная дистанция
  - `medium` / `Medium haul`
  - `Up to €400`

### Expected database result

В `leads` для этой заявки:

- `distance_km` заполнено
- `distance_band = medium`
- `estimated_compensation_eur = 400`
- `compensation_currency = EUR`
- `estimate_status = calculated`
- `estimate_explanation` заполнено

## Test 2 — Short route under 1500 km returns up to EUR 250

### Suggested routes

- `WAW -> RIX`
- `VNO -> RIX`
- любой другой гарантированно короткий маршрут из каталога

### Steps

1. Выбрать короткий маршрут `< 1500 km`
2. Пройти flow до конца

### Expected result

- preview показывает `Up to €250`
- `distance_band = short`
- в `leads.estimated_compensation_eur = 250`

## Test 3 — Long route over 3500 km returns up to EUR 600

### Suggested routes

- `LHR -> JFK`
- `MAD -> DXB`
- любой другой маршрут `> 3500 km`, который точно есть в каталоге

### Steps

1. Выбрать длинный маршрут `> 3500 km`
2. Пройти flow до конца

### Expected result

- preview показывает `Up to €600`
- `distance_band = long`
- в `leads.estimated_compensation_eur = 600`

## Test 4 — Missing airport coordinate does not block submission

### Steps

1. Использовать аэропорт, у которого нет `latitude_deg` или `longitude_deg`
   или временно протестировать на записи с пустыми координатами
2. Пройти flow до конца

### Expected result

- claim успешно отправляется
- пользователь видит success flow
- в `leads`:
  - `distance_km = null`
  - `distance_band = unknown`
  - `estimated_compensation_eur = null`
  - `estimate_status = pending_review`

## Test 5 — Backend recalculates value even if frontend sends wrong amount

### Goal

Проверить, что backend не доверяет frontend preview/amount.

### Steps

1. Открыть Network tab в браузере
2. На финальном submit изменить payload запроса к `submit-claim`, если это возможно через devtools/mock tooling
3. Подставить неправильные estimate values, например:
   - `estimated_compensation_eur = 250` для длинного маршрута
   - `distance_band = short` для длинного маршрута
4. Отправить claim

### Expected result

В `leads` должны сохраниться backend-calculated значения, а не поддельные frontend values:

- сервер заново считает `distance_km`
- сервер заново считает `distance_band`
- сервер заново считает `estimated_compensation_eur`

## Test 6 — Client portal shows saved estimate

### Goal

Проверить отображение estimate в кабинете клиента, если/когда это уже подключено в runtime.

### Steps

1. Подать claim с маршрутом, для которого рассчитывается estimate
2. Войти в клиентский кабинет
3. Открыть `client/dashboard`, `client/claims` и `client/claims/:id`, если detail route используется

### Expected result

- клиент видит сохраненный estimate
  - distance / band / estimated compensation
  - либо в dashboard summary
  - либо в claim details

### Note

Если это еще не выведено в UI, зафиксировать как remaining task:

- `client portal estimate display not implemented yet`

## Test 7 — Admin sees estimate fields

### Steps

1. Открыть `Admin -> Leads`
2. Выбрать свежую заявку
3. Проверить блок `Compensation estimate`
4. Если lead был converted, открыть `Admin -> Cases`
5. Проверить estimate в case detail

### Expected result

Admin видит:

- calculated distance
- distance band
- estimated compensation
- estimate status
- reason codes, если есть

Для `pending_review` должен быть заметный статус.

## Test 8 — Manual text airport without airport_id results in pending_review

### Steps

1. В `claim-flow` не выбирать airport из autocomplete
2. Ввести текст вручную в departure/destination
3. Пройти flow до конца

### Expected result

- submit не падает
- preview может показать `Estimate pending review`
- в `leads`:
  - `departure_airport_id = null`
  - `arrival_airport_id = null`
  - `estimate_status = pending_review`
  - `distance_band = unknown`

## Test 9 — Connecting flight final destination logic is documented as future or handled if available

### Current expectation

На текущем этапе basic distance engine работает по выбранным departure/destination airports.

### Steps

1. Протестировать маршрут с пересадкой
2. Проверить, как пользователь указывает:
   - direct / non-direct flight
   - конечный аэропорт
3. Проверить сохраненный estimate

### Expected result

Должно быть одно из двух:

1. Либо логика final destination уже явно реализована и работает корректно
2. Либо это явно зафиксировано как future enhancement, и текущий estimate считается только по текущей паре airport points

### Required documentation outcome

Если final destination logic еще не реализована:

- зафиксировать это как known limitation
- не считать это regression

## Database verification checklist

После каждого тестового submit проверить `leads`:

- `departure_airport_id`
- `arrival_airport_id`
- `distance_km`
- `distance_band`
- `estimated_compensation_eur`
- `compensation_currency`
- `estimate_status`
- `estimate_explanation`

Если legacy `claims` используются в среде, проверить те же поля и там.

## Pass criteria

Слой distance compensation можно считать готовым к следующему этапу, если:

- preview в claim-flow соответствует маршруту
- backend всегда пересчитывает estimate сам
- отсутствие координат не ломает submit
- admin видит estimate fields
- pending review cases легко обнаруживаются
- known limitations по connecting flights задокументированы
