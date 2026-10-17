import { PrismaClient, type Church } from "../src/generated/prisma/client";

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
///
/// This list is the whole statement of which churches exist. It is not a list
/// of churches to add: a Church row whose slug is not declared here is deleted
/// by the next run. That is what makes "exactly two churches" — the invariant
/// the isolation suite rests on — a property of running the seed rather than a
/// property of having run it exactly once.
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
    slug: "everlasting-vine",
    name: "The Everlasting Vine Chapel and Fellowship Centre",
    accentSet: "default",
    logoFileId: null,
    timezone: "Africa/Lagos",
    // A deliberately smaller set, so nothing can assume every church has
    // every module.
    enabledModules: ["offerings", "attendance", "members", "notifications"],
  },
];

const declaredSlugs = churches.map((church) => church.slug);

async function main() {
  // The seed owns the Church table outright and deletes what it does not
  // declare, and a church takes its rows with it through the cascades in the
  // schema. Against development data that is convergence; against real data it
  // would be destruction.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "The seed rewrites the Church table and must never run against production data.",
    );
  }

  const { saved, removedSlugs } = await prisma.$transaction(async (tx) => {
    const saved: Church[] = [];

    for (const church of churches) {
      // Keyed on slug, so a run that finds the slug updates that row in place
      // and keeps its id and everything pointing at it.
      saved.push(
        await tx.church.upsert({
          where: { slug: church.slug },
          update: church,
          create: church,
        }),
      );
    }

    // The half an upsert cannot do. Renaming a church here changes its slug, so
    // the upsert above stops matching the row the previous run created and
    // inserts a second one beside it — which is how a third church appeared
    // after the last rename. Deleting every undeclared slug reconciles that,
    // and it holds for renames generally rather than for one of them: the file
    // never has to remember what a church used to be called, because the rule
    // is "a slug that is not in this list does not exist". Renaming the next
    // church is therefore still a one-place edit.
    const undeclared = await tx.church.findMany({
      where: { slug: { notIn: declaredSlugs } },
      select: { slug: true, name: true },
    });

    await tx.church.deleteMany({ where: { slug: { notIn: declaredSlugs } } });

    return { saved, removedSlugs: undeclared.map((church) => `${church.slug} (${church.name})`) };
  });

  for (const church of saved) {
    console.log(`Seeded church ${church.slug} (${church.id})`);
  }

  for (const removed of removedSlugs) {
    console.log(`Removed church ${removed}: the seed no longer declares that slug.`);
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
