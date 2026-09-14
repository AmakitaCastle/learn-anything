import fontUrl from './wenkai.ttf?url';
import data from './wenkai.json' with { type: 'json' };
import { parseHandwritingBundle } from '@learn-anything/lesson-schema';
const bundle = { ...parseHandwritingBundle(data), fontUrl };
export default bundle;
