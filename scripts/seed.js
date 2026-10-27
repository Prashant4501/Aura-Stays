import { seedDatabase } from '../server/scripts/seed.js';

seedDatabase()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
