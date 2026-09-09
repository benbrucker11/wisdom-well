/**
 * Seeds one family spanning four generations so the relationship helpers can be
 * exercised against a real database.
 *
 *   Stanisław ═══ Helena
 *             │
 *          Andrzej ═══ Maria
 *             │
 *      ┌──────┴───────┐
 *   Katarzyna ═ Tomasz    Piotr
 *      │
 *   ┌──┴──┐
 *  Lena   Jan
 *
 * Steward: Andrzej. Stanisław's grandchildren are Katarzyna and Piotr;
 * his great-grandchildren are Lena and Jan.
 */
import { PrismaClient, RelationshipType } from "@prisma/client";
import { describeFamilyFrom } from "../lib/relationships";

const prisma = new PrismaClient();

async function main() {
  const family = await prisma.family.create({
    data: { name: "The Kowalski Family" },
  });

  const person = (givenName: string, dob?: string) =>
    prisma.member.create({
      data: {
        familyId: family.id,
        givenName,
        familyName: "Kowalski",
        dateOfBirth: dob ? new Date(dob) : null,
      },
    });

  const stanislaw = await person("Stanisław", "1932-04-02");
  const helena = await person("Helena", "1935-09-19");
  const andrzej = await person("Andrzej", "1958-01-11");
  const maria = await person("Maria", "1960-06-30");
  const katarzyna = await person("Katarzyna", "1985-03-14");
  const piotr = await person("Piotr", "1988-11-02");
  const tomasz = await person("Tomasz", "1984-07-21");
  const lena = await person("Lena", "2012-05-05");
  const jan = await person("Jan", "2015-08-30");

  await prisma.family.update({
    where: { id: family.id },
    data: { stewardMemberId: andrzej.id },
  });

  const link = (from: string, to: string, type: RelationshipType) =>
    prisma.relationship.create({
      data: { familyId: family.id, fromMemberId: from, toMemberId: to, type },
    });

  await link(stanislaw.id, helena.id, RelationshipType.SPOUSE_OF);
  await link(stanislaw.id, andrzej.id, RelationshipType.PARENT_OF);
  await link(helena.id, andrzej.id, RelationshipType.PARENT_OF);
  await link(andrzej.id, maria.id, RelationshipType.SPOUSE_OF);
  await link(andrzej.id, katarzyna.id, RelationshipType.PARENT_OF);
  await link(maria.id, katarzyna.id, RelationshipType.PARENT_OF);
  await link(andrzej.id, piotr.id, RelationshipType.PARENT_OF);
  await link(maria.id, piotr.id, RelationshipType.PARENT_OF);
  await link(katarzyna.id, tomasz.id, RelationshipType.SPOUSE_OF);
  await link(katarzyna.id, lena.id, RelationshipType.PARENT_OF);
  await link(tomasz.id, lena.id, RelationshipType.PARENT_OF);
  await link(katarzyna.id, jan.id, RelationshipType.PARENT_OF);
  await link(tomasz.id, jan.id, RelationshipType.PARENT_OF);

  const view = await describeFamilyFrom(stanislaw.id);
  console.log(
    `Seeded "${family.name}".`,
    `\n  Stanisław's grandchildren: ${view.grandchildren
      .map((g) => g.givenName)
      .join(", ")}`,
    `\n  Relationships from Stanisław:`,
  );
  for (const { member, relation } of view.relations) {
    console.log(`    ${member.givenName}: ${relation}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
