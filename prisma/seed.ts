import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const user1 = await prisma.user.upsert({
    where: { email: "alice@example.com" },
    update: {},
    create: {
      username: "alice",
      email: "alice@example.com",
      passwordHash: "dev-only-password-hash",
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: "bob@example.com" },
    update: {},
    create: {
      username: "bob",
      email: "bob@example.com",
      passwordHash: "dev-only-password-hash",
    },
  });

  console.log("Seeded users:");
  console.log(user1);
  console.log(user2);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });