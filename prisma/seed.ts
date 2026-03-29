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
    where: { phoneNumber: "+989121111111" },
    update: {},
    create: {
      username: "alice",
      phoneNumber: "+989121111111",
      phoneVerifiedAt: new Date(),
      email: "alice@example.com",
      passwordHash: null,
    },
  });

  const user2 = await prisma.user.upsert({
    where: { phoneNumber: "+989122222222" },
    update: {},
    create: {
      username: "bob",
      phoneNumber: "+989122222222",
      phoneVerifiedAt: new Date(),
      email: "bob@example.com",
      passwordHash: null,
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