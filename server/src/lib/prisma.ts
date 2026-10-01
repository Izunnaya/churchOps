import { PrismaClient } from "../generated/prisma/client";

/// One client for the whole process. Controllers import it directly; there is no
/// data-access layer above it.
const prisma = new PrismaClient();

export default prisma;
export { prisma };
