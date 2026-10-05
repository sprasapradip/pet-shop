import { cp } from 'node:fs/promises';

await cp('src/views', 'dist/views', { recursive: true });
console.log('Views copied to dist/views');
