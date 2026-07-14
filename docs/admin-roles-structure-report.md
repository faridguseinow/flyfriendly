# Отчёт по структуре ролей сотрудников в админ-панели

## Краткий вывод

В проекте уже есть полноценная RBAC-модель для админ-панели, но она работает в гибридном режиме:

- legacy-слой: `profiles.role` + `user_admin_roles`
- dynamic-слой: `admin_roles` + `admin_team_members` + `admin_role_permissions`
- UI-слой: `admin_menu_items` + `admin_role_menu_visibility`

Для сотрудников это означает, что роли уже можно строить как отдельные бизнес-роли с набором прав и видимостью меню, но в системе ещё остаются старые каналы назначения доступа. Поэтому правильная структура ролей должна опираться на dynamic RBAC, а legacy-слой стоит считать переходным.

## 1. Где в проекте живут роли

### Основные сущности

- `public.admin_roles` — каталог ролей
- `public.admin_permissions` — каталог permission-кодов
- `public.admin_role_permissions` — связка роль → права
- `public.admin_team_members` — сотрудники админ-команды
- `public.user_admin_roles` — legacy / совместимый слой назначений
- `public.admin_menu_items` — канонические пункты меню админки
- `public.admin_role_menu_visibility` — видимость меню по ролям
- `public.admin_activity_logs` — журнал действий по ролям и сотрудникам
- `public.admin_work_sessions` — рабочие сессии сотрудников

### Где это используется в приложении

- `src/admin/rbac.js` — статический словарь системных ролей и fallback-права
- `src/admin/accessControl.js` — доступ к маршрутам и owner-only правила
- `src/admin/AdminAuthContext.jsx` — вычисление effective roles / permissions
- `src/pages/AdminTeam/index.jsx` — UI сотрудников, ролей, прав и активности
- `src/pages/AdminRoles/index.jsx` — отдельное управление ролями
- `src/services/adminService.js` — загрузка, создание, обновление, деактивация и удаление ролей
- `supabase/sql/005_admin_foundation_rbac.sql` — базовый RBAC
- `supabase/sql/022_dynamic_admin_team_management_foundation.sql` — dynamic roles / team / menu / logs / safeguards
- `supabase/sql/023_owner_access_alignment.sql` и `024_owner_only_admin_reset.sql` — owner alignment и reset-сценарий
- `supabase/sql/044_admin_granular_access_hardening.sql` — проверка прав через RLS

## 2. Как устроена админ-панель сотрудников

### Разделы страницы сотрудников

В `Employees` уже заложены 4 рабочих вкладки:

- `Employees`
- `Roles`
- `Permissions / Menu Access`
- `Activity`

### Каноническая структура меню

Сейчас админка строится вокруг 22 страниц в 6 разделах:

- `Dashboard`
- `Operations`
- `People`
- `Finance`
- `Content`
- `Settings`

Это важно, потому что роль управляет не только действиями, но и тем, какие разделы сотрудник видит в UI.

## 3. Фактическая модель доступа

### Принцип 1. Permissions и menu visibility — это не одно и то же

- permissions отвечают за реальный доступ к маршрутам, данным и действиям
- menu visibility отвечает только за видимость пунктов меню

Если страница скрыта в меню, это не должно автоматически давать или забирать backend-доступ.

### Принцип 2. Owner — защищённая роль

В проекте уже есть жёсткие owner safeguards:

- owner / super admin получают полный доступ
- owner-only маршруты недоступны обычным ролям
- нельзя безопасно снять критичные права с последнего owner
- нельзя деактивировать owner role
- нельзя скрыть critical menu items для owner role
- нельзя удалить или заблокировать последнего owner

### Принцип 3. Route access проверяется отдельно

В `src/admin/accessControl.js` есть owner-only зоны:

- `/admin/people/users-roles`
- `/admin/settings`
- `/admin/settings/system`
- `/admin/access`
- `/admin/roles`
- `/admin/menu-builder`
- `/admin/team/:id/activity`

Остальные зоны открываются через `anyPermissions` / `allPermissions`.

## 4. Системные роли в коде

Ниже — фактические системные роли из `src/admin/rbac.js`.

| Роль | Код | Уровень | Права |
| --- | --- | --- | --- |
| Owner | `owner` | высший | полный доступ |
| Super Admin | `super_admin` | высший | полный доступ |
| Admin | `admin` | системный | 45 permission-кодов |
| Operations Manager | `operations_manager` | операционный | 18 permission-кодов |
| Case Manager | `case_manager` | кейсы | 14 permission-кодов |
| Customer Support Agent | `customer_support_agent` | поддержка | 11 permission-кодов |
| Finance Manager | `finance_manager` | финансы | 10 permission-кодов |
| Content Manager | `content_manager` | контент | 8 permission-кодов |
| Partner Manager | `partner_manager` | партнёры | 5 permission-кодов |
| Read Only | `read_only` | аудит / просмотр | 13 permission-кодов |

### Что умеют роли по смыслу

- `owner` / `super_admin` — вся админка, роли, сотрудники, настройки, восстановление доступа
- `admin` — почти вся операционная и административная зона без owner-защит
- `operations_manager` — лиды, кейсы, задачи, коммуникации, документы, базовая отчётность
- `case_manager` — ведение кейсов и клиентской операционки
- `customer_support_agent` — работа с клиентами, задачами, сообщениями, документами
- `finance_manager` — финансы, выгрузки, кейсы и документы в части расчётов
- `content_manager` — CMS, блог, FAQ, контентные страницы
- `partner_manager` — партнёрская зона и реферальные операции
- `read_only` — безопасный просмотр модулей без изменений

## 5. Permission-домены, которые уже есть в системе

### Операционные

- `dashboard.*`
- `leads.*`
- `cases.*`
- `customers.*`
- `tasks.*`
- `communications.*`
- `documents.*`

### Бизнес / back-office

- `partners.*`
- `partner_applications.*`
- `finance.*`
- `reports.*`

### Контент

- `cms.*`
- `blog.*`
- `faq.*`

### Администрирование

- `users.*`
- `roles.*`
- `team.*`
- `menu.*`
- `settings.*`
- `activity.*`
- `trash.*`

## 6. Статусы сотрудников и ролей

### Статусы сотрудников

В UI и сервисах поддерживаются:

- `active`
- `invited`
- `suspended`
- `inactive`
- `archived`

### Статусы ролей

В UI и schema используются:

- `active`
- `inactive`

Архитектурно предусмотрен и более широкий жизненный цикл, но в текущем UI он сведён к активной / неактивной роли.

## 7. Наблюдения по текущему состоянию из интерфейса

По предоставленному скриншоту в системе уже есть 3 роли:

- `Owner`
- `manager`
- `Customer Claims Manager`

Это означает, что проект уже использует не только системные роли, но и кастомные.

### Что видно как аномалия и что надо проверить

- роль `manager` отображается с бейджем `OWNER`, что выглядит рискованно
- роль `Customer Claims Manager` тоже отображается с бейджем `OWNER`
- у `manager` на скриншоте `0 permissions`, но `22 visible pages`
- все 3 сотрудника сейчас сидят на `Owner`, если скриншот отражает реальные данные

Это либо:

- неверные флаги `is_owner_role` в БД
- ошибка маппинга данных в UI
- следствие копирования owner-role при создании кастомных ролей

## 8. Рекомендуемая структура ролей для сотрудников

Ниже — рекомендуемая ролевая модель для админ-панели Fly Friendly.

### 1. Owner

Кому:

- только основатель / главный операционный владелец системы

Что даёт:

- полный доступ
- управление ролями
- управление сотрудниками
- системные настройки
- аварийное восстановление доступа

Ограничение:

- в компании должно быть 1–2 человека максимум

### 2. Super Admin / Platform Admin

Кому:

- технический директор, head of operations, trusted senior admin

Что даёт:

- почти полный доступ ко всем модулям
- без права ломать owner-recovery модель

Когда нужен:

- если нужен второй уровень админ-доступа без размывания owner

### 3. Operations Manager

Кому:

- руководитель клиентских операций

Что даёт:

- лиды
- кейсы
- задачи
- коммуникации
- документы
- операционная отчётность

### 4. Customer Claims Manager

Кому:

- сотрудник, который ведёт обращения клиентов и кейсы по компенсациям

Что даёт:

- `leads.view`, `leads.edit`
- `cases.view`, `cases.edit`
- `customers.view`
- `tasks.view`, `tasks.edit`
- `communications.view`, `communications.edit`
- `documents.view`, `documents.manage`, `documents.download`

Что не должно давать:

- `finance.edit`
- `settings.*`
- `roles.manage`
- `team.manage`
- `users.manage`
- экспорт чувствительных данных

Рекомендация:

- эту роль лучше держать как кастомную, но без owner-флага и без системного статуса

### 5. Customer Support Agent

Кому:

- первая линия поддержки

Что даёт:

- работа с клиентами
- задачи
- коммуникации
- ограниченная работа с документами

Чего не даёт:

- настройка ролей
- финансы
- системные настройки

### 6. Finance Manager

Кому:

- бухгалтерия / финансовый менеджер

Что даёт:

- финансы
- выплаты
- расчёты
- выгрузки отчётов
- доступ к связанным кейсам и документам

### 7. Content Manager

Кому:

- контент / SEO / редакция

Что даёт:

- CMS
- блог
- FAQ
- контентные страницы

### 8. Partner Manager

Кому:

- менеджер партнёрской программы

Что даёт:

- партнёры
- партнёрские заявки
- рефералы
- partner payouts / commissions в пределах своей зоны

### 9. Read Only / Audit

Кому:

- QA
- внешний консультант
- аудит
- обучение сотрудников

Что даёт:

- безопасный просмотр без изменений

## 9. Что лучше не делать

- не использовать универсальную роль `manager` без доменной специализации
- не назначать `owner` операционным сотрудникам
- не хранить основную бизнес-логику доступа только в `profiles.role`
- не смешивать видимость меню и реальные права
- не создавать кастомные роли через копию owner-role без жёсткой очистки owner-флагов

## 10. Рекомендуемый целевой стандарт для проекта

### Источник истины

Нужно считать основным источником истины:

- `admin_roles`
- `admin_team_members`
- `admin_role_permissions`
- `admin_role_menu_visibility`

А legacy-слой оставить только как переходную совместимость.

### Минимальный обязательный набор ролей

- `owner`
- `super_admin`
- `operations_manager`
- `customer_claims_manager`
- `customer_support_agent`
- `finance_manager`
- `content_manager`
- `partner_manager`
- `read_only`

### Правила для всех новых ролей

- кастомная роль не должна получать `is_owner_role = true`
- системная роль не должна удаляться
- owner-критичные permission-коды нельзя снимать у последнего owner
- role changes должны логироваться в `admin_activity_logs`
- route access и RLS должны проверяться независимо от меню

## 11. Приоритетные проверки и доработки

### Высокий приоритет

1. Проверить, почему кастомные роли на скриншоте имеют бейдж `OWNER`.
2. Проверить, почему у `manager` нет permissions, но есть полный набор visible pages.
3. Убрать массовое использование `Owner` для обычных сотрудников.
4. Свести к одному источнику истины назначение роли сотруднику.

### Средний приоритет

1. Ввести явную роль `customer_claims_manager` как стандартизированный шаблон.
2. Убрать generic `manager` и заменить его доменными ролями.
3. Синхронизировать page guards и role-management UI.

### Техническое замечание

Сейчас есть расхождение:

- в навигации страница `Employees` выглядит permission-driven
- в `accessControl` этот маршрут фактически `ownerOnly`

Это надо унифицировать, иначе UI и правила доступа будут расходиться.

## 12. Итог

Для Fly Friendly оптимальная структура ролей — это не одна роль `manager`, а набор специализированных ролей сотрудников:

- owner / super admin
- operations manager
- customer claims manager
- customer support agent
- finance manager
- content manager
- partner manager
- read only

Текущая архитектура проекта уже почти готова к этой модели. Основная задача сейчас — убрать owner-размывание, зафиксировать кастомные роли без owner-флагов и сделать `admin_roles` + `admin_team_members` основным источником истины.

## 13. Следующий этап безопасности: Employee Page Access

### Что уже должно стать основой

Новый слой доступа нужно считать главным не по role-code, а по page-key:

- `admin_employee_page_access.team_member_id`
- `admin_employee_page_access.menu_item_key`
- `can_view`
- `can_edit`

Это означает:

- owner / super admin всегда проходят проверки
- обычный сотрудник получает доступ только к тем страницам, которые явно выданы
- `view` и `edit` должны проверяться отдельно
- inactive / suspended сотрудник не должен проходить ни frontend, ни backend, ни RLS

### Рекомендуемая page-access матрица

- `dashboard.activity` → `activity_logs`, `admin_activity_logs`
- `dashboard.revenue`, `finance.*` → `case_finance`, `finance_audit_logs`, `partner_commissions`, `referral_partner_payouts`
- `content.blog`, `content.pages`, `content.media`, `content.website` → `blog_posts`, `faq_items`, `cms_pages`, `cms_blocks`
- `partners.referral`, `partners.applications`, `partners.referralPartners`, `partners.referrals` → `partner_applications`, `referral_partners`, `partner_commissions`, `referral_partner_payouts`
- `people.employees`, `settings.access` → owner-only управление сотрудниками и структурой доступа

### Что должно остаться только как fallback

Legacy-проверки через:

- `profiles.role`
- `user_admin_roles`
- `has_admin_permission(...)`
- `has_any_admin_permission(...)`

нужны только для обратной совместимости, пока не весь backend переведён на page-access. Для новых чувствительных зон этого уже недостаточно.

### Где legacy fallback всё ещё вероятно остаётся

- старые RLS-политики операционных таблиц, где ещё фигурируют permission-коды
- исторические edge functions, если внутри них проверяется только admin-role без page-key
- старые service helpers, которые проверяют только permission-код и не знают про `menu_item_key`

Следующий безопасный шаг после этого этапа:

1. добить edge functions до явных page-key checks;
2. убрать broad fallback из старых operational RLS;
3. оставить permission-коды только как derived compatibility layer, а не как источник истины.
