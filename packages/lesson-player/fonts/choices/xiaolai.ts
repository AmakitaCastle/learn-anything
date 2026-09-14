import fontUrl from './xiaolai.ttf?url';
import data from './xiaolai.json' with { type: 'json' };
import { parseHandwritingBundle } from '@learn-anything/lesson-schema';
const bundle = { ...parseHandwritingBundle(data), fontUrl };
export default bundle;
