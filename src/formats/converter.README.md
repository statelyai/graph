# Converter

Utility for creating custom `GraphFormatConverter` objects from `to`/`from` function pairs.

## API

```ts
import { createFormatConverter } from '@statelyai/graph/converter';
```

### `createFormatConverter(to, from): GraphFormatConverter<T>`

```ts
import { createFormatConverter } from '@statelyai/graph/converter';

const yamlConverter = createFormatConverter(
  (graph) => toYAML(graph),
  (yaml) => fromYAML(yaml),
);

const yaml = yamlConverter.to(graph);
const graph = yamlConverter.from(yaml);
```

This module also re-exports pre-built converters for the simplest formats:

- `adjacencyListConverter` — `GraphFormatConverter<Record<string, string[]>>`
- `edgeListConverter` — `GraphFormatConverter<[string, string][]>`
