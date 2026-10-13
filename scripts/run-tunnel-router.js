import {startRouter} from '@dot-bridge/core/router/main.js';
import {qqAdapter} from '../src/tunnel-adapter.js';
await startRouter([qqAdapter]);
