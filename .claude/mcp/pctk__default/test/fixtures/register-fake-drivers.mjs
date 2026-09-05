import { register } from 'node:module';

register('./fake-driver-loader.mjs', import.meta.url);
