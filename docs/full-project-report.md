# Fly Friendly Full Project Report

## Цель документа

Этот документ собирает в одном месте текущее состояние проекта Fly Friendly:

- публичный сайт;
- claim-flow и логика компенсаций;
- auth и кабинеты;
- partner / referral program;
- admin panel;
- стили и UI-система;
- Supabase schema / Edge Functions;
- уже созданные audit / QA документы;
- текущие ограничения и технический долг.

Документ рассчитан как master-report для передачи в ChatGPT, разработчику или проектному менеджеру.

## 1. Общая архитектура проекта

Проект построен как `React + Vite + Supabase` приложение с мультиязычным публичным сайтом и несколькими защищенными зонами.

Ключевые слои:

- публичный marketing / claim website;
- client auth и client portal;
- partner application / partner portal / referral tracking;
- admin panel;
- Supabase database + RLS + Edge Functions.

Основные точки входа:

- роутинг: [src/routes/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/routes/index.jsx:1)
- shell приложения: [src/App.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/App.jsx:1)
- Supabase client: [src/lib/supabase.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/lib/supabase.js:1)

## 2. Публичный сайт

Публичная часть уже включает:

- home;
- about;
- contact;
- blog;
- privacy / terms / cookies;
- referral / partner marketing page;
- claim-flow;
- localized routes вида `/:lang/...`.

Главные public pages:

- [src/pages/Home](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/Home)
- [src/pages/About](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/About)
- [src/pages/Contact](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/Contact)
- [src/pages/Blog](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/Blog)
- [src/pages/Referral](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/Referral)
- [src/pages/Claim](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/Claim)

Публичный navbar уже поддерживает:

- мультиязычность;
- кнопку `Start Claim`;
- иконку личного кабинета для авторизованного пользователя.

Navbar:

- [src/layout/Navbar/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/layout/Navbar/index.jsx:1)

## 3. Claim-flow и процесс компенсации

Текущий claim-flow уже работает как публичный процесс подачи заявки без обязательного предварительного логина.

Основная схема:

1. пользователь выбирает аэропорт вылета и прилета;
2. выбирает авиакомпанию;
3. указывает тип проблемы / задержку;
4. указывает дату рейса;
5. вводит контактные данные;
6. загружает документы;
7. подписывает согласие;
8. отправляет заявку;
9. создается lead;
10. создается или находится client account;
11. отправляется письмо с password setup / secure access link;
12. клиент может войти в client portal.

Главная страница flow:

- [src/pages/Claim/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/Claim/index.jsx:1)

Сервис submit / lead-layer:

- [src/services/leadService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/leadService.js:1)
- [supabase/functions/submit-claim/index.ts](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/functions/submit-claim/index.ts:1)

Что уже сделано в claim-flow:

- публичная пошаговая форма;
- сохранение `lead`;
- сохранение `lead_documents`;
- сохранение `lead_signatures`;
- отправка claim confirmation email;
- автосоздание / привязка client account после заявки;
- переход в client portal через password setup link.

### Distance-based compensation preview

В проект уже добавлен preview расчета компенсации по расстоянию между аэропортами.

Что уже работает:

- если выбраны оба аэропорта из каталога, claim-flow показывает preview:
  - маршрут;
  - примерную дистанцию;
  - distance category;
  - `Up to €250 / €400 / €600`;
- если координат нет, пользователь видит `Estimate pending review`;
- preview не блокирует submit.

Основные файлы:

- [src/lib/compensationDistance.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/lib/compensationDistance.js:1)
- [shared/compensation-distance.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/shared/compensation-distance.js:1)
- [src/services/catalogService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/catalogService.js:1)
- [src/pages/Claim/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/Claim/index.jsx:1)

### Backend distance estimate

Серверная функция `submit-claim` теперь пересчитывает estimate сама и не доверяет фронтенду.

Сохраняются поля:

- `distance_km`
- `distance_band`
- `estimated_compensation_eur`
- `compensation_currency`
- `estimate_status`
- `estimate_explanation`

Это уже добавлено в:

- [supabase/sql/021_distance_compensation_estimate.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/021_distance_compensation_estimate.sql:1)
- [supabase/functions/submit-claim/index.ts](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/functions/submit-claim/index.ts:1)

### Что еще не доведено в compensation logic

- полноценная логика final destination для connecting flights;
- advanced EU261 route classification;
- более сложная eligibility matrix beyond simple distance bands.

Это задокументировано как known limitation.

## 4. Аэропорты и каталог маршрутов

В проекте уже есть нормализованный airport catalog.

База:

- `public.airports`

Используется:

- в claim-flow;
- в admin;
- в leads / claims / flight_checks;
- в email маршруте;
- в distance calculation.

Каталог аэропортов уже поддерживает:

- Supabase search;
- fallback JSON;
- пассажирскую фильтрацию;
- IATA / ICAO search;
- координаты аэропортов для distance engine.

Основные файлы:

- [src/services/catalogService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/catalogService.js:1)
- [src/data/airports-fallback.json](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/data/airports-fallback.json:1)

Отдельные документы:

- [docs/distance-compensation-audit.md](/Users/a1111/Documents/My%20projects/Github/fly-friendly/docs/distance-compensation-audit.md:1)
- [docs/distance-compensation-qa.md](/Users/a1111/Documents/My%20projects/Github/fly-friendly/docs/distance-compensation-qa.md:1)

## 5. Auth, reset-password и клиентский аккаунт

В проекте уже есть полноценный пользовательский auth flow:

- login;
- register;
- forgot password;
- reset password;
- secure password setup после claim submit;
- route guards;
- role-based redirects.

Основные файлы:

- [src/auth/AuthContext.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/auth/AuthContext.jsx:1)
- [src/auth/AuthGuards.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/auth/AuthGuards.jsx:1)
- [src/auth/routeUtils.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/auth/routeUtils.js:1)
- [src/pages/Auth/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/Auth/index.jsx:1)
- [src/services/authService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/authService.js:1)

Что уже сделано:

- claim-created password setup flow исправлен;
- `reset-password` вынесен из protected gate;
- recovery links больше не должны использовать `localhost`;
- client profile создается / подтягивается автоматически;
- client portal открывается после установки пароля.

Важный недавний фикс:

- публичное отсутствие auth session теперь считается нормальным состоянием для гостя, а не ошибкой;
- это устранило падение guest flows с сообщением `Auth session missing!`.

## 6. Client Portal

Client portal уже реализован как отдельный раздел.

Маршруты:

- `/client/dashboard`
- `/client/claims`
- `/client/claims/:id`
- `/client/documents`
- `/client/profile`
- `/client/payments`

Основные файлы:

- [src/pages/ClientPortal/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/ClientPortal/index.jsx:1)
- [src/services/clientPortalService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/clientPortalService.js:1)

Что уже есть:

- own leads / cases;
- own documents;
- own profile;
- own payments / finance data;
- route-level protection.

Текущее ограничение:

- отдельное отображение сохраненного distance estimate в client portal еще не доведено как завершенный UX-слой.

## 7. Partner / Referral Program

Partner program уже выстроен как отдельный домен и в значительной части реализован.

### 7.1 Partner application

Теперь `/partner/apply` должен создавать только `partner_applications`, а не `referral_partners`.

Что уже есть:

- guest submit;
- authenticated submit;
- расширенная форма;
- success state `Application received`;
- partner access не выдается на этом этапе.

Основные файлы:

- [src/pages/PartnerApply/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/PartnerApply/index.jsx:1)
- [src/services/partnerService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/partnerService.js:1)
- [supabase/functions/submit-partner-application/index.ts](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/functions/submit-partner-application/index.ts:1)
- [supabase/sql/020_partner_applications_model_update.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/020_partner_applications_model_update.sql:1)

### 7.2 Partner admin review

В админке уже есть dedicated queue:

- `/admin/partner-applications`

Что умеет:

- показывает `pending` по умолчанию;
- фильтрует `pending / approved / rejected / all`;
- показывает detail drawer;
- поддерживает `Approve`;
- поддерживает `Reject` с reason;
- кнопки подключены к Edge Functions.

Основные файлы:

- [src/pages/AdminPartnerApplications/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminPartnerApplications/index.jsx:1)
- [src/services/adminService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/adminService.js:1)
- [supabase/functions/approve-partner-application/index.ts](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/functions/approve-partner-application/index.ts:1)
- [supabase/functions/reject-partner-application/index.ts](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/functions/reject-partner-application/index.ts:1)

### 7.3 Partner portal

Partner portal уже реализован.

Маршруты:

- `/partner/dashboard`
- `/partner/link`
- `/partner/referrals`
- `/partner/earnings`
- `/partner/payouts`
- `/partner/profile`
- `/partner/assets`
- `/partner/pending`
- `/partner/rejected`
- `/partner/suspended`

Основные файлы:

- [src/pages/PartnerPortal/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/PartnerPortal/index.jsx:1)
- [src/services/partnerPortalService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/partnerPortalService.js:1)

Что уже сделано:

- доступ зависит от auth + partner role + partner status;
- партнер видит только свои referrals;
- партнер видит только свои commissions;
- партнер видит только свои payouts;
- клиентские email / phone / documents не показываются;
- добавлены empty states;
- добавлены error states.

### 7.4 Referral tracking

Referral tracking уже работает отдельно от partner application.

Поддерживается:

- `/r/:code`
- `?ref=code`

Что уже сделано:

- сохраняется только approved partner attribution;
- invalid / suspended / archived / not-approved codes игнорируются;
- перед submit claim идет повторная backend validation;
- referral не создает client account сам по себе.

Основные файлы:

- [src/pages/ReferralCapture/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/ReferralCapture/index.jsx:1)
- [src/services/referralService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/referralService.js:1)
- [src/services/authService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/authService.js:1)

### 7.5 Partner email workflow

Уже добавлены письма:

- application received;
- application approved;
- application rejected;
- partner suspended;
- partner reactivated.

Основные файлы:

- [supabase/functions/_shared/partner-program-email.ts](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/functions/_shared/partner-program-email.ts:1)
- [supabase/functions/update-partner-portal-status/index.ts](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/functions/update-partner-portal-status/index.ts:1)

### 7.6 Документация по партнерке

Уже есть:

- [docs/partner-program-audit.md](/Users/a1111/Documents/My%20projects/Github/fly-friendly/docs/partner-program-audit.md:1)
- [docs/partner-program-qa.md](/Users/a1111/Documents/My%20projects/Github/fly-friendly/docs/partner-program-qa.md:1)

## 8. Admin Panel

Admin panel уже очень широкая и модульная.

Маршруты и модули:

- dashboard;
- leads;
- cases;
- customers;
- tasks;
- communication;
- documents;
- partner applications;
- referral partners;
- finance;
- reports;
- cms;
- blog;
- faq;
- users & roles;
- trash;
- settings;
- activity logs.

Навигация:

- [src/admin/navigation.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/admin/navigation.js:1)

Layout:

- [src/admin/AdminLayout.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/admin/AdminLayout.jsx:1)

RBAC / auth:

- [src/admin/AdminAuthContext.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/admin/AdminAuthContext.jsx:1)
- [src/admin/AdminGuards.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/admin/AdminGuards.jsx:1)
- [src/admin/rbac.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/admin/rbac.js:1)

### 8.1 Admin Leads

Что уже есть:

- расширенный detail view;
- видны email, name, phone, route, airline, docs, signature, notes;
- видны distance estimate поля:
  - distance;
  - band;
  - estimated compensation;
  - estimate status;
  - reason codes.

Основные файлы:

- [src/pages/AdminLeads/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminLeads/index.jsx:1)
- [src/pages/AdminLeads/style.scss](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminLeads/style.scss:1)

### 8.2 Admin Cases

Что уже есть:

- case list и detail view;
- finance info;
- documents;
- status / owner / updates;
- lead-linked compensation estimate block;
- `Pending review` marker для estimate.

Основные файлы:

- [src/pages/AdminCases/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminCases/index.jsx:1)
- [src/pages/AdminCases/style.scss](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminCases/style.scss:1)

### 8.3 Admin Documents

Что уже есть:

- documents center;
- move to trash;
- download;
- delete flow через корзину.

### 8.4 Admin Users & Roles

Что уже есть:

- список пользователей;
- assignment ролей;
- super admin delete-to-trash flow.

### 8.5 Admin Trash

Что уже есть:

- централизованная корзина;
- restore;
- permanent delete для допустимых сущностей;
- soft-delete foundation в БД.

## 9. Стили и UI-система

Проект уже имеет свою прикладную style-system базу.

### 9.1 Глобальные стили

Базовые файлы:

- [src/reset.scss](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/reset.scss:1)
- [src/App.scss](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/App.scss:1)

Что уже задается глобально:

- цветовые CSS variables;
- шрифт `Onest`;
- типографика `h1/h2/h3/p`;
- глобальные `.btn`, `.btn-primary`, `.btn-small`;
- `.section`, `.band`, `.placeholder-page`;
- responsive breakpoints;
- scroll-top button.

### 9.2 Admin styles

Отдельный admin style layer:

- [src/admin/admin.scss](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/admin/admin.scss:1)

Что уже сделано:

- grid shell;
- fixed admin sidebar;
- topbar;
- search dropdown;
- admin auth card;
- responsive behavior;
- module-level wrappers.

### 9.3 Page-scoped styles

Большинство страниц уже используют собственные `style.scss`, включая:

- claim;
- partner apply;
- partner portal;
- admin leads;
- admin cases;
- и другие admin модули.

Это значит:

- стили уже изолированы по страницам;
- проект не собран на одном монолитном CSS-файле;
- визуальный язык в целом уже согласован.

### 9.4 Общий визуальный язык

Текущий UI стиль:

- светлый интерфейс;
- голубой primary brand color;
- rounded cards / inputs / buttons;
- мягкие тени и светлые контуры;
- много воздуха;
- понятная B2C подача на публичном сайте;
- отдельный чистый B2B/admin layout для back-office.

## 10. Supabase и backend слой

Проект уже использует:

- Supabase Auth;
- Postgres schema;
- RLS;
- Storage buckets;
- Edge Functions.

### 10.1 Основные бизнес-таблицы

- `profiles`
- `leads`
- `lead_documents`
- `lead_signatures`
- `customers`
- `cases`
- `case_documents`
- `case_finance`
- `communications`
- `tasks`
- `referral_partners`
- `partner_applications`
- `referrals`
- `partner_commissions`
- `referral_partner_payouts`
- `trash_items`

### 10.2 Важные Edge Functions

- `submit-claim`
- `send-claim-confirmation`
- `submit-partner-application`
- `approve-partner-application`
- `reject-partner-application`
- `update-partner-portal-status`

### 10.3 Уже примененные архитектурные слои

- auth / profile linkage;
- referral capture;
- partner application workflow;
- partner approval workflow;
- distance estimate save on submit;
- email workflows;
- admin-side review flows.

## 11. Уже созданные audit / QA документы

В `docs` уже есть:

- [auth-partner-audit.md](/Users/a1111/Documents/My%20projects/Github/fly-friendly/docs/auth-partner-audit.md:1)
- [auth-client-partner-cleanup-audit.md](/Users/a1111/Documents/My%20projects/Github/fly-friendly/docs/auth-client-partner-cleanup-audit.md:1)
- [partner-program-audit.md](/Users/a1111/Documents/My%20projects/Github/fly-friendly/docs/partner-program-audit.md:1)
- [partner-program-qa.md](/Users/a1111/Documents/My%20projects/Github/fly-friendly/docs/partner-program-qa.md:1)
- [distance-compensation-audit.md](/Users/a1111/Documents/My%20projects/Github/fly-friendly/docs/distance-compensation-audit.md:1)
- [distance-compensation-qa.md](/Users/a1111/Documents/My%20projects/Github/fly-friendly/docs/distance-compensation-qa.md:1)

Этот файл является их объединяющим summary-report.

## 12. Что уже можно считать реализованным

С высокой вероятностью уже реализованы и могут считаться рабочими как foundation:

- публичный мультиязычный сайт;
- claim-flow;
- client auth onboarding после claim submit;
- reset-password / password setup flow;
- client portal;
- partner application intake;
- admin partner review queue;
- partner portal;
- referral tracking;
- role-based portal access;
- admin panel modules;
- airport catalog;
- distance preview в claim-flow;
- backend distance compensation estimate save;
- admin display of estimate fields;
- partner email workflow;
- claim email workflow;
- trash / soft-delete foundation.

## 13. Что еще не идеально / known limitations

### Compensation / airport logic

- connecting flights final destination logic не доведена;
- advanced EU261 calculation еще не полная;
- client portal display для estimate можно усилить.

### Partner program

- legacy dual status model в `referral_partners` все еще живет:
  - `status`
  - `portal_status`
- старый `Referral Partners` admin module все еще partly legacy;
- полный production review всей partner email цепочки руками еще нужен.

### Admin / UI

- в проекте уже много модулей, но не все имеют одинаковую глубину polish;
- есть крупные JS bundles, сборка предупреждает о больших чанках.

### Browser-level verification

- часть проверок уже была сделана на уровне сборки и runtime flow;
- полный финальный browser QA всего сайта еще нужно делать отдельно перед launch.

## 14. Последний важный runtime-фикс

Исправлен публичный сбой `Auth session missing!` для гостевых страниц partner/referral domain.

Что было:

- guest page могла дергать auth user lookup как обязательный шаг;
- Supabase отвечал `Auth session missing!`;
- UI показывал это сырой ошибкой.

Что исправлено:

- отсутствие сессии для гостя теперь считается нормальным `null`;
- `/partner/apply` и похожие guest flows больше не должны падать из-за этого.

Файлы:

- [src/services/authService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/authService.js:125)
- [src/services/partnerService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/partnerService.js:136)

## 15. Главный вывод

Проект уже не находится в состоянии "голого MVP". В нем построен достаточно широкий продуктовый каркас:

- public acquisition;
- claim intake;
- auth onboarding;
- client portal;
- partner/referral program;
- admin back-office;
- airport catalog;
- distance compensation foundation;
- email workflows;
- data ownership;
- RLS / RBAC direction.

Главные оставшиеся задачи уже не про "начать строить", а про:

- финальный production QA;
- добивку legacy мест;
- выравнивание статусов и некоторых flows;
- polishing UX и analytics;
- финальную стабилизацию перед запуском.

## 16. Что можно просить у ChatGPT дальше

На основе этого отчета можно просить:

1. сделать final production-readiness review;
2. составить launch checklist;
3. определить приоритеты финальных доработок;
4. предложить cleanup dual status model;
5. предложить final admin panel polish plan;
6. предложить compensation engine v2 plan;
7. предложить UX improvements для client portal и partner portal.
