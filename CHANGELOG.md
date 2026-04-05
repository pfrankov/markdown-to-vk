# CHANGELOG

## Unreleased

- Canvas-трансформ таблиц перенесён в экспериментальный entrypoint `markdown-to-vk/experimental`, а `@napi-rs/canvas` переведён в optional peer dependency.

## 0.2.0

- Добавлен `createCanvasTableTransform` для более точного выравнивания markdown-таблиц через canvas `measureText()`, включая жирный текст и эмодзи.
- Улучшено стандартное выравнивание таблиц за счёт более точной оценки ширины unicode-символов и форматирования.
- Улучшена обработка заголовков с unicode-пробелами и служебными символами в начале строки.
