import { createFormatConverter } from '../converter';
import { fromD2 } from './parser';
import { toD2 } from './emitter';

export { fromD2 } from './parser';
export { toD2 } from './emitter';

export type {
  D2Graph,
  D2GraphData,
  D2NodeData,
  D2EdgeData,
  D2PortData,
  D2LabelBlock,
  D2GridSpec,
  D2Source,
  D2Arrow,
  D2ArrowheadSpec,
} from './shared';

/**
 * Bidirectional converter for [d2](https://d2lang.com/) diagram syntax.
 *
 * @example
 * ```ts
 * import { d2Converter } from '@statelyai/graph/d2';
 *
 * const graph = d2Converter.from('a -> b: hello');
 * const text = d2Converter.to(graph);
 * ```
 */
export const d2Converter = createFormatConverter(toD2, fromD2);
