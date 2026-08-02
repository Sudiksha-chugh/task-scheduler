async function start() {
  console.log('Scheduler service starting...');
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start scheduler service:', error);
    process.exit(1);
  });
}

module.exports = { start };
