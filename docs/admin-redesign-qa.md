# Admin Redesign QA

Этот документ покрывает ручную проверку новой админской структуры, dynamic roles/team management, partner admin UX и регрессии по остальному продукту.

## Preconditions

- Применена миграция `022_dynamic_admin_team_management_foundation.sql`.
- В базе есть:
  - хотя бы один `owner` / `super_admin`;
  - несколько `admin_team_members`;
  - данные в `leads`, `cases`, `case_finance`, `partner_applications`, `referral_partners`;
  - `admin_menu_items`, `admin_role_menu_visibility`, `admin_activity_logs`, `admin_work_sessions`.
- Edge Functions задеплоены:
  - `approve-partner-application`
  - `reject-partner-application`
  - `update-partner-portal-status`
  - `submit-claim`
  - `send-claim-confirmation`

## 1. Navigation

### 1.1 Grouped sidebar renders
- Открыть `/admin`.
- Убедиться, что sidebar показывает группы:
  - `Overview`
  - `Claims Operations`
  - `Customers`
  - `Partner Program`
  - `Finance`
  - `Content`
  - `System`
- Убедиться, что у групп есть lucide-иконки.
- Убедиться, что список внутри групп раскрывается по клику на заголовок группы.

Expected:
- sidebar рендерится без ошибок;
- группы раскрываются и сворачиваются;
- активная группа выглядит выделенной.

### 1.2 Active route works
- Перейти последовательно в:
  - `/admin`
  - `/admin/leads`
  - `/admin/cases`
  - `/admin/partner-applications`
  - `/admin/finance`
- Проверить active state у нужного пункта и группы.

Expected:
- активный route подсвечен;
- при переходе в дочерний route активная группа раскрыта.

### 1.3 Mobile sidebar works
- Открыть админку на ширине планшета и мобильного.
- Нажать кнопку меню.
- Проверить:
  - sidebar открывается;
  - overlay закрывает sidebar;
  - клик по пункту закрывает sidebar.

Expected:
- mobile drawer работает;
- layout не ломается.

### 1.4 Fallback static navigation works if menu config fails
- Временно симулировать отсутствие dynamic menu config:
  - пустой `admin_menu_items`
  - или недоступность `admin_role_menu_visibility`
  - или через devtools/network block на соответствующий запрос
- Обновить `/admin`.

Expected:
- sidebar все равно строится из static navigation;
- админка открывается;
- routes остаются доступны по старой конфигурации.

## 2. Dynamic Roles

### 2.1 Owner can create role
- Открыть `/admin/roles`.
- Создать новую custom role.
- Заполнить:
  - name
  - description
  - permissions

Expected:
- роль создается;
- отображается в списке;
- `system/custom` badge корректный.

### 2.2 Owner can edit role
- Открыть созданную custom role.
- Изменить описание и несколько permissions.

Expected:
- изменения сохраняются;
- при перезагрузке экрана данные остаются.

### 2.3 Owner can duplicate role
- Нажать `Duplicate` на custom role.

Expected:
- создается новая роль;
- permissions копируются.

### 2.4 Owner can deactivate role
- Деактивировать custom role.

Expected:
- роль уходит в inactive state;
- destructive action требует confirm.

### 2.5 Owner cannot delete owner/system role
- Попробовать удалить:
  - owner role
  - любую system role

Expected:
- UI не дает удалить;
- если доступен backend action, он тоже блокирует это.

### 2.6 Owner cannot remove last owner access
- Если в системе только один active owner:
  - попытаться снять critical owner permissions;
  - попытаться деактивировать owner role.

Expected:
- операция запрещена;
- last owner access не теряется.

## 3. Team

### 3.1 Owner can create/invite team member
- Открыть `/admin/team`.
- Попробовать создать/добавить team member.

Expected:
- если full invite flow готов, создается участник и уходит invite/reset flow;
- если full invite flow еще не готов, UI и service boundary работают, а ограничение явно задокументировано.

### 3.2 Owner can change role
- Назначить сотруднику другую admin role.

Expected:
- роль меняется;
- после refresh отображается новое значение.

### 3.3 Owner can suspend/reactivate member
- Перевести участника в `suspended`.
- Затем вернуть в `active`.

Expected:
- статус меняется;
- confirm dialog показывается на destructive action.

### 3.4 Owner cannot suspend/remove self as last owner
- Зайти под owner.
- Если это последний owner, попробовать:
  - suspend self
  - remove self

Expected:
- операция заблокирована.

## 4. Menu Builder

### 4.1 Owner can enable/disable item
- Открыть `/admin/menu-builder` если UI уже реализован.
- Включить/выключить menu item.

Expected:
- visible state меняется для нужной роли;
- sidebar обновляется после refresh.

### 4.2 Owner can reorder item
- Изменить sort order элементов.

Expected:
- порядок меняется в sidebar.

### 4.3 Owner can assign visibility by role
- Для одной роли скрыть один пункт меню.
- Для другой роли оставить видимым.

Expected:
- видимость зависит от роли.

### 4.4 Owner cannot hide critical system access from owner role
- Попробовать скрыть critical system items для owner:
  - roles
  - team
  - settings
  - menu builder

Expected:
- critical items для owner скрыть нельзя;
- backend guard или constraint блокирует действие.

Note:
- если `/admin/menu-builder` еще не реализован, этот раздел помечается как `Pending backend/UI implementation`.

## 5. Permissions

### 5.1 Hidden menu item does not grant or remove security
- Скрыть menu item у роли, не меняя permissions.
- Открыть прямой URL.

Expected:
- если permission есть, route откроется даже без menu item;
- если permission нет, route будет заблокирован.

### 5.2 Route guards block unauthorized access
- Зайти под ролью без `finance.view`.
- Открыть `/admin/finance`.

Expected:
- показывается `Access Denied` или redirect на `/admin/forbidden`.

### 5.3 Direct URL access is denied without permission
- Для нескольких routes проверить прямой доступ:
  - `/admin/roles`
  - `/admin/team`
  - `/admin/partner-applications`

Expected:
- route guard блокирует доступ;
- одного скрытия menu item недостаточно для доступа.

## 6. Dashboard

### 6.1 KPI cards load
- Открыть `/admin`.

Expected:
- KPI cards загружаются без runtime ошибок;
- значения берутся из реальных данных.

### 6.2 Action queues load
- Проверить:
  - unassigned leads
  - leads needing review
  - cases missing documents
  - estimate pending review
  - partner applications pending
  - payouts pending

Expected:
- очереди рендерятся;
- ссылки/open actions работают.

### 6.3 Empty states work
- Проверить на пустой базе или через фильтры.

Expected:
- показываются empty states;
- layout не ломается.

### 6.4 Errors are handled
- Временно сломать один из запросов через network block/devtools.

Expected:
- экран показывает error state;
- вся админка не падает целиком.

## 7. Leads / Cases

### 7.1 Leads filters work
- Открыть `/admin/leads`.
- Проверить:
  - search
  - status
  - disruption type
  - date range
  - estimate status
  - owner

Expected:
- таблица корректно фильтруется.

### 7.2 Leads detail drawer works
- Открыть lead из списка.

Expected:
- drawer показывает:
  - customer info
  - route details
  - distance estimate
  - documents
  - signature
  - notes

### 7.3 Leads status badges render
- Проверить:
  - lead status
  - estimate status

Expected:
- badges окрашены консистентно.

### 7.4 Leads distance estimate appears
- Открыть lead с distance estimate.

Expected:
- видны:
  - distance
  - distance band
  - estimated compensation
  - estimate status

### 7.5 Leads existing actions still work
- Проверить:
  - convert/open case
  - owner assignment
  - notes/status updates если доступны

Expected:
- существующие операции не сломаны.

### 7.6 Cases filters work
- Открыть `/admin/cases`.
- Проверить:
  - search
  - status
  - owner
  - airline
  - date range
  - finance status

Expected:
- фильтры работают.

### 7.7 Cases detail drawer works
- Открыть case.

Expected:
- drawer показывает:
  - timeline
  - documents
  - communications
  - finance
  - next action
  - status update

### 7.8 Cases status badges render
- Проверить stage/status badges и next-action labels.

Expected:
- badges читаемы и консистентны.

### 7.9 Cases existing actions still work
- Проверить update workflow, документы, communications, finance actions.

Expected:
- backend logic не сломана.

## 8. Partner

### 8.1 Applications review works
- Открыть `/admin/partner-applications`.
- Проверить queue, filters, detail drawer.
- Сделать:
  - approve
  - reject с причиной

Expected:
- approve/reject работают;
- данные обновляются;
- UI не дублирует registry logic.

### 8.2 Referral partners registry works
- Открыть `/admin/referral-partners`.

Expected:
- это страница approved partners only;
- видно:
  - status
  - referral link
  - commission rate
  - performance

### 8.3 Status changes still go through backend function
- На approved partner выполнить suspend/reactivate.

Expected:
- update идет через `update-partner-portal-status`;
- partner access меняется корректно;
- логирование срабатывает.

### 8.4 Referrals page works
- Открыть `/admin/referrals`.

Expected:
- видны referred claims;
- partner attribution показывается корректно.

### 8.5 Partner commissions page works
- Открыть `/admin/partner-commissions`.

Expected:
- видны partner commissions;
- detail drawer открывается.

### 8.6 Partner payouts page works
- Открыть `/admin/partner-payouts`.

Expected:
- видны payout records;
- create payout / detail flow не сломан.

## 9. Activity / Work Sessions

### 9.1 Activity logs are created for major actions
- Выполнить несколько действий:
  - login
  - logout
  - view lead
  - update lead
  - view case
  - update case
  - approve/reject partner application
  - update finance
  - role update
  - team suspend

Expected:
- в `admin_activity_logs` появляются записи;
- metadata безопасна;
- нет паролей, tokens, document contents.

### 9.2 Work session starts in admin area
- Войти в `/admin`.

Expected:
- в `admin_work_sessions` появляется новая запись с `started_at`.

### 9.3 Heartbeat updates last_seen_at
- Оставить админку открытой на несколько минут.

Expected:
- `last_seen_at` обновляется heartbeat-ом.

### 9.4 Logout closes session
- Выйти из админки.

Expected:
- `ended_at` и `duration_seconds` заполнены.

## 10. Regression

### 10.1 Public site still works
- Проверить главную, блог, referral page, contact.

Expected:
- public site не сломан.

### 10.2 Claim-flow still works
- Пройти claim flow до submit.

Expected:
- заявка создается;
- письмо отправляется;
- сумма не показывается публично;
- в client portal видна.

### 10.3 Client portal still works
- Войти клиентом.

Expected:
- claims/documents/profile/payments открываются;
- estimate в claims detail виден.

### 10.4 Partner portal still works
- Войти approved partner.

Expected:
- dashboard/referrals/earnings/payouts/profile/link открываются;
- route guard не сломан.

### 10.5 Auth reset-password still works
- Запросить reset email.
- Пройти ссылку сброса/создания пароля.

Expected:
- reset page открывается;
- пароль меняется;
- redirect после success корректный.

## Pass Criteria

- Админка открывается без runtime ошибок.
- Sidebar, dynamic permissions и team/roles logic работают без потери доступа owner.
- Partner admin pages разделены по назначению.
- Dashboard, Leads, Cases, Finance работают в новом UX.
- Activity/work sessions пишутся.
- Public site, claim-flow, client portal, partner portal и reset-password не сломаны.

## Known Manual Notes

- Если `menu-builder` еще не реализован как UI, тесты по нему отметить как `Pending`.
- Если invite email flow для `/admin/team` еще частично не готов, тестировать:
  - UI
  - service boundary
  - documented limitation.
