# markdown-to-vk
<table>
  <tr>
    <td><img width="400" alt="markdown" src="https://github.com/user-attachments/assets/e80985e0-7f2a-4845-b28a-d57100335654" /></td>
    <td><img width="400" alt="vk" src="https://github.com/user-attachments/assets/5f032875-df19-43e8-ba60-dd5632b7b281" /></td>
  </tr>
</table>

Конвертирует Markdown в текст и `formatData`-сущности, совместимые с [VK API](https://dev.vk.com/ru/reference/objects/message).

## Установка

```bash
npm install markdown-to-vk
```

## Быстрый старт

```ts
import { createMarkdownToVkPipeline } from "markdown-to-vk";

const pipeline = createMarkdownToVkPipeline();
const chunks = pipeline.render("**Привет**, _мир_!");
// chunks[0].text  → "Привет, мир!"
// chunks[0].items → [
//   { type: "bold",   offset: 0, length: 6 },
//   { type: "italic", offset: 8, length: 3 }
// ]
```

Результат можно отправлять в VK чанками. Пример для `vk-io`:

```ts
import { getRandomId } from "vk-io";

for (const chunk of chunks) {
  await vk.api.messages.send({
    peer_id,
    random_id: getRandomId(),
    message: chunk.text,
    format_data: JSON.stringify({ version: 1, items: chunk.items }),
  });
}
```

Для повторной отправки того же чанка после сетевой ошибки используйте тот же `random_id`.

## Поддерживаемый синтаксис

| Markdown | Результат |
|---|---|
| `**жирный**` или `__жирный__` | **жирный** → format `bold` |
| `*курсив*` или `_курсив_` | *курсив* → format `italic` |
| `***жирный курсив***` | format `bold` + `italic` |
| `` `код` `` | Обратные кавычки сохраняются, содержимое не парсится |
| `[текст](url)` | Текст + format `url` |
| `# Заголовок` | ЗАГОЛОВОК (uppercase) + format `bold` |
| `## Заголовок` / `### Заголовок` | Исходный регистр + format `bold` |
| `#### Заголовок` – `###### Заголовок` | Исходный регистр + format `italic` |
| `---` | `───` (горизонтальная линия) |
| `> цитата` | `> цитата` + format `italic` |
| `- [ ] задача` / `- [x] задача` | `□ задача` / `■ задача` |
| Таблицы | Заголовки жирные, ячейки выровнены |
| `\*экранирование\*` | Литеральные символы без форматирования |

Блоки кода (`` ``` ``) не парсятся — содержимое передаётся как есть.

## API

### `createMarkdownToVkPipeline(options?)`

Создаёт переиспользуемый пайплайн. Результат `render` — массив чанков `{ text, items }[]`.

```ts
import { createMarkdownToVkPipeline } from "markdown-to-vk";

const pipeline = createMarkdownToVkPipeline({
  chunkSize: 4096, // по умолчанию 4096
});

const a = pipeline.render("**раз**");
const b = pipeline.render("_два_");
const c = pipeline.render("# Заголовок\n**текст** и _курсив_");
```

`render` принимает `string | null | undefined` (для `null`/`undefined` вернёт пустой результат).

Также можно передать `textTransforms` для предобработки исходного текста до markdown-правил.

`chunkSize` можно переопределить при создании пайплайна. Конечное число округляется вниз; значения меньше 1 нормализуются до 1. Для `NaN` и бесконечности используется значение по умолчанию 4096.

При разбиении библиотека старается сохранять целые абзацы, цитаты, таблицы и блоки кода в тройных обратных кавычках, если они помещаются в лимит. Если блок длиннее лимита, разбиение происходит по более естественным границам строк и слов, а `items` корректно обрезаются на стыках чанков.

Лимит считается в кодовых единицах UTF-16; `@` учитывается как 2 единицы. Суррогатная пара не разделяется между чанками. Если `chunkSize` равен 1, один `@` или один символ из суррогатной пары занимает отдельный чанк стоимостью 2. Значение 4096 — консервативный лимит библиотеки.

## Кастомный пайплайн

Можно собрать пайплайн только из нужных правил:

```ts
import {
  createMarkdownToVkPipeline,
  emphasisTransform,
  linkTransform,
  strongTransform,
} from "markdown-to-vk";

// Только жирный, курсив и ссылки — без заголовков, таблиц и т.д.
const pipeline = createMarkdownToVkPipeline({
  pipeline: [
    strongTransform,
    emphasisTransform,
    linkTransform,
  ],
});

pipeline.render("# не заголовок, **но жирный**");
// [{ text: "# не заголовок, но жирный", items: [{ type: "bold", offset: 16, length: 9 }] }]
```

<details>
<summary>Все доступные трансформы</summary>

- `escapeTransform` — экранирование (`\*`, `\[`, …)
- `codeSpanTransform` — инлайн-код (`` `code` ``)
- `linkTransform` — ссылки (`[text](url)`)
- `strongEmphasisTransform` — `***bold italic***`
- `emphasisTransform` — `*italic*`
- `strongTransform` — `**bold**`
- `tableTransform` — таблицы
- `separatorTransform` — горизонтальные линии (`---`)
- `quoteTransform` — цитаты (`> text`)
- `checkboxTransform` — чекбоксы (`- [ ]` / `- [x]`)
- `headingTransform` — заголовки (`# text`)
- `collapseBlankLinesBeforeCodeFencesTransform` — убирает пустые строки перед `` ``` `` и нормализует `\r\n` → `\n`

</details>

## Типы

Библиотека полностью типизирована. Основные типы:

```ts
import type {
  VkMarkdownChunk,     // { text, items }
  VkFormattedMessage,  // { text, formatData? }
  VkFormatItem,        // { type, offset, length, url? }
  VkFormatType,        // "bold" | "italic" | "underline" | "url"
  VkMarkdownPipeline,  // { pipeline, textTransforms, chunkSize, render }
  VkMarkdownPipelineOutput, // VkMarkdownChunk[]
} from "markdown-to-vk";
```

## Разработка

```bash
npm run build          # Сборка
npm run lint           # Линтинг
npm test               # Тесты
npm run test:coverage  # Тесты с покрытием
```

## Лицензия

MIT
