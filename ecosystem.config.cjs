module.exports = {
  apps: [
    { name: 'ek-web', script: 'dist/server.js', instances: 2, exec_mode: 'cluster', max_memory_restart: '400M', env: { NODE_ENV: 'production' } },
    { name: 'ek-worker', script: 'dist/worker.js', instances: 1, env: { NODE_ENV: 'production' } },
  ],
};
