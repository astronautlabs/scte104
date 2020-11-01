import { suite } from 'razmin';
import './index';

suite()
    .include(['**/*.test.ts'])
    .run()
;