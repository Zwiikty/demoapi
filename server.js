const app = require('./src/app');
const prisma = require('./prisma/client');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log('Attempting to connect to database...');
    await prisma.$connect();
    console.log('Connected to database');
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`); 
    });
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

startServer();

