# WebRTC Nest Monorepo

pnpm-монорепа с несколькими приложениями:

- `apps/server/gateway-service` - HTTP/gRPC gateway и Socket.IO signaling;
- `apps/server/auth-service` - gRPC auth-сервис с Postgres, Drizzle ORM и Redis-сессиями;
- `apps/server/signaling-service` - отдельный NestJS signaling-сервер;
- `apps/client` - React/Vite клиент видеокомнаты.

Приложение показывает минимальную видеокомнату на WebRTC. Сервер не передает
медиа-потоки через себя: видео и аудио идут напрямую между браузерами. NestJS
используется только для обмена signaling-сообщениями, а пользовательский интерфейс
живет отдельно в React-приложении.

## Структура

- `apps/server/signaling-service/src/main.ts` - точка входа отдельного signaling-сервера.
- `apps/server/signaling-service/src/app.module.ts` - подключает signaling module.
- `apps/server/gateway-service/src/modules/signaling/signaling.gateway.ts` - Socket.IO gateway для комнат и WebRTC-сигналинга.
- `apps/server/gateway-service/src/modules/signaling/signaling.service.ts` - состояние комнат и участников.
- `apps/server/auth-service/src/modules/auth` - регистрация, логин и проверка Redis-сессий.
- `apps/client/src/App.tsx` - React-компонент с логикой комнаты и WebRTC.
- `apps/client/src/styles.css` - стили интерфейса.
- `apps/client/vite.config.ts` - конфигурация Vite.

## Как это работает

1. Пользователь открывает страницу и вводит название комнаты.
2. Браузер запрашивает доступ к камере и микрофону через `getUserMedia`.
3. React-клиент подключается к Socket.IO серверу и отправляет событие `join-room`.
4. Сервер возвращает список участников, которые уже находятся в комнате.
5. Новый участник создает `RTCPeerConnection` для каждого существующего участника.
6. WebRTC-клиенты обмениваются `offer`, `answer` и ICE-кандидатами через событие `signal`.
7. После установления соединения аудио и видео идут напрямую между браузерами.

Сервер хранит только состояние комнат: socket id участников и их отображаемые имена.
Медиа-данные через NestJS не проходят.

## Запуск

```bash
pnpm install
pnpm dev
```

Команда запускает оба приложения:

- gateway-service: `http://127.0.0.1:3001`
- клиент: `http://127.0.0.1:5173`

Откройте `http://127.0.0.1:5173` в двух вкладках браузера, введите одинаковое
название комнаты и разрешите доступ к камере/микрофону.

Можно запускать приложения отдельно:

```bash
pnpm dev:signaling
pnpm dev:auth
pnpm dev:gateway
pnpm dev:client
```

По умолчанию клиент подключается к signaling gateway `http://127.0.0.1:3001`.
Если сервер запущен по другому адресу, задайте переменную:

```bash
VITE_SIGNALING_URL=http://127.0.0.1:3001 pnpm dev:client
```

Чтобы открыть приложение с другого устройства в той же сети, запустите сервер так:

```bash
HOST=0.0.0.0 pnpm dev
```

Для клиента в этом случае тоже укажите адрес signaling-сервера:

```bash
VITE_SIGNALING_URL=http://<ip-компьютера>:3001 pnpm dev:client
```

## Сборка

```bash
pnpm build
pnpm start
```

`pnpm start` запускает только собранный NestJS signaling-service. Gateway-service
можно запустить отдельно через `pnpm start:gateway`. Собранный клиент можно
посмотреть через Vite preview:

```bash
pnpm preview:client
```

## Ограничения

- Для локальной разработки `getUserMedia` работает на `localhost` и `127.0.0.1`.
- При запуске на удаленном хосте браузер потребует HTTPS для доступа к камере и микрофону.
- В проекте используется публичный STUN-сервер Google. Для сложных сетей и NAT может
  понадобиться TURN-сервер.
- Комнаты хранятся в памяти процесса. После перезапуска сервера состояние комнат очищается.
