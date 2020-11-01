import 'reflect-metadata';
import 'zone.js';
import 'source-map-support/register';

import { suite } from 'razmin';
import './index';

suite()
    .include(['**/*.test.ts'])
    .run()
;