import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

/// Fictional data only, including for the first church. The brief is explicit
/// about that: nothing here is a real congregation, a real name or a real
/// figure.
///
/// Two churches, not one, because every isolation test needs a second church to
/// try and fail to reach. They are deliberately confusable where it matters —
/// once slice 0.6 adds `churchId` the two will also share category names, a
/// member name and a near-identical email, so a query that forgets to scope
/// returns something that looks plausible rather than something obviously wrong.
///
/// Between them they also cover the identity cases the design has to handle:
/// a short name with crest accents, and a long name with no logo at all.
const churches = [
  {
    slug: "living-spring",
    name: "Living Spring Assembly",
    accentSet: "crest",
    logoFileId: null,
    timezone: "Africa/Lagos",
    enabledModules: [
      "offerings",
      "expenses",
      "attendance",
      "members",
      "departmentReports",
      "notifications",
    ],
  },
  {
    // Long on purpose: exercises wrapping at 360px and in the 248px sidebar.
    slug: "redeemed-chapel-all-nations",
    name: "The Redeemed Chapel of All Nations, Surulere",
    accentSet: "default",
    logoFileId: null,
    timezone: "Africa/Lagos",
    // A deliberately smaller set, so nothing can assume every church has
    // every module.
    enabledModules: ["offerings", "attendance", "members", "notifications"],
  },
];

async function main() {
  for (const church of churches) {
    // Keyed on slug so re-running the seed updates rather than duplicates.
    const saved = await prisma.church.upsert({
      where: { slug: church.slug },
      update: church,
      create: church,
    });
    console.log(`Seeded church ${saved.slug} (${saved.id})`);
  }

  const total = await prisma.church.count();
  console.log(`${total} churches in the database.`);

  // Members, users, departments and categories per church land in 0.6, once
  // every church-owned model carries churchId. Seeding them now would mean
  // rows belonging to no church, which is the state 0.6 exists to make
  // impossible.
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
