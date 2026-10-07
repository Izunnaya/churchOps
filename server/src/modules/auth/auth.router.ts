import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { Role, UserStatus } from "../../generated/prisma/enums";
import {
  generateRefreshToken,
  generateResetToken,
  generateVerificationCode,
  hashPassword,
  refreshTokenExpiry,
  signAccessToken,
  verifyPassword,
} from "../../lib/auth";
import { badRequest, forbidden, notFound, unauthorized } from "../../lib/errors";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";

export const authRouter = Router();

/// Build Spec section 6: five attempts on a verification code.
const MAX_VERIFY_ATTEMPTS = 5;

const password = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(200);

async function issueSession(userId: string, userAgent?: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { roles: true },
  });

  const refreshToken = generateRefreshToken();
  await prisma.session.create({
    data: {
      userId,
      refreshToken,
      userAgent: userAgent ?? null,
      expiresAt: refreshTokenExpiry(),
    },
  });

  // BLOCKED ON DEC-02. The token needs the one church this session acts for,
  // and there is no way to derive it yet: User has no churchId, and neither do
  // UserRole or Session, because whether an account belongs to one church or
  // spans several is exactly what DEC-02 decides. Guessing here would hard-code
  // that answer into sign-in, so this deliberately does not compile. Everything
  // downstream of the token — the scoping middleware and every scoped query —
  // is finished and waiting on this one value.
  const accessToken = signAccessToken({
    sub: user.id,
    roles: user.roles.map((r) => r.role),
    departmentIds: user.roles
      .map((r) => r.departmentId)
      .filter((id): id is string => Boolean(id)),
  });

  return { accessToken, refreshToken, user };
}

function presentUser(user: {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  username: string;
  status: UserStatus;
  roles: { role: Role; departmentId: string | null }[];
}) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    username: user.username,
    status: user.status,
    roles: user.roles.map((r) => ({ role: r.role, departmentId: r.departmentId })),
  };
}

// --- signup cycle --------------------------------------------------------

/// Only a department leader signs up. The Secretary, Treasurer and Pastor are
/// seeded directly — there is one of each, so the brief gives them no screen.
authRouter.post(
  "/register",
  validate({
    body: z.object({
      fullName: z.string().trim().min(1, "Enter your name"),
      email: z.email("Enter a valid email address"),
      phone: z.string().trim().min(7, "Enter your phone number"),
      username: z.string().trim().min(3, "Use at least 3 characters"),
      password,
      departmentId: z.string().min(1, "Choose your department"),
    }),
  }),
  async (req, res) => {
    const body = req.body as {
      fullName: string;
      email: string;
      phone: string;
      username: string;
      password: string;
      departmentId: string;
    };

    // One response, whatever happened. Email and username are unique across
    // every church, so an answer that distinguishes "already exists" from
    // "taken" from success tells an unauthenticated caller which addresses
    // belong to staff at other churches. The department id is equally
    // probe-able: it is a church-owned row being resolved from an
    // unauthenticated body, so a differing answer confirms that a department
    // exists in some church. Both are forbidden by Build Spec 16.6 and brief
    // section 2 item 4.
    //
    // No id is returned either: a userId in the success body is itself the
    // oracle, and the one thing that made this endpoint's outcome observable.
    const accepted = {
      message: "If those details can be registered, a verification code is on its way.",
    };

    const clash = await prisma.user.findFirst({
      where: { OR: [{ email: body.email }, { username: body.username }] },
    });

    // Resolving a department from client input is the wrong shape and survives
    // only until DEC-01/DEC-02 give signup a church-scoped entry point. Until
    // then it must at least not be a probe.
    const department = await prisma.department.findUnique({
      where: { id: body.departmentId },
    });

    if (clash || !department) {
      res.status(202).json(accepted);
      return;
    }

    const user = await prisma.user.create({
      data: {
        fullName: body.fullName,
        email: body.email,
        phone: body.phone,
        username: body.username,
        passwordHash: await hashPassword(body.password),
        status: UserStatus.PENDING_VERIFICATION,
        roles: {
          create: { role: Role.DEPARTMENT_LEADER, departmentId: department.id },
        },
      },
    });

    const code = generateVerificationCode();
    // Ten minutes, per Build Spec section 6. It was thirty.
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.emailVerificationToken.create({
      data: { userId: user.id, token: code, expiresAt },
    });

    // TODO: hand `code` to the mailer once outbound email is wired up. The code
    // is never logged: several churches share one process, so anyone reading
    // logs for church A would hold account-takeover credentials for church B.
    console.log(`[dev] verification code issued for user ${user.id}`);

    res.status(202).json(accepted);
  },
);

authRouter.post(
  "/verify-email",
  validate({
    body: z.object({
      email: z.email("Enter a valid email address"),
      code: z.string().trim().length(6, "The code is 6 digits"),
    }),
  }),
  async (req, res) => {
    const { email, code } = req.body as { email: string; code: string };

    // Every failure answers the same way, so this cannot be used to discover
    // which addresses have accounts.
    const wrongCode = badRequest("That code is not right. Check and try again.");

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw wrongCode;
    const userId = user.id;

    const token = await prisma.emailVerificationToken.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!token) throw wrongCode;
    if (token.expiresAt < new Date()) throw badRequest("That code has expired. Ask for a new one.");
    if (token.attempts >= MAX_VERIFY_ATTEMPTS) {
      throw badRequest("Too many attempts. Ask for a new code.");
    }

    // Counted, not just compared: a 6-digit code is 10^6 guesses otherwise.
    if (token.token !== code) {
      await prisma.emailVerificationToken.update({
        where: { id: token.id },
        data: { attempts: { increment: 1 } },
      });
      throw wrongCode;
    }

    // Verified, but still not usable: the Secretary clears the account next.
    await prisma.$transaction([
      prisma.emailVerificationToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: new Date(), status: UserStatus.PENDING_APPROVAL },
      }),
    ]);

    res.json({
      data: { status: UserStatus.PENDING_APPROVAL },
      message: "Your email is confirmed. The church secretary will approve your account.",
    });
  },
);

// --- sign in -------------------------------------------------------------

authRouter.post(
  "/login",
  validate({
    body: z.object({
      username: z.string().trim().min(1, "Enter your username"),
      password: z.string().min(1, "Enter your password"),
    }),
  }),
  async (req, res) => {
    const { username, password: plain } = req.body as {
      username: string;
      password: string;
    };

    const user = await prisma.user.findUnique({
      where: { username },
      include: { roles: true },
    });

    // Same message either way, so the form cannot be used to discover usernames.
    const invalid = unauthorized("That username or password is not right.");
    if (!user) throw invalid;
    if (!(await verifyPassword(plain, user.passwordHash))) throw invalid;

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw forbidden("Confirm your email address first.");
    }
    if (user.status === UserStatus.PENDING_APPROVAL) {
      throw forbidden("Your account is waiting for the church secretary to approve it.");
    }
    if (user.status === UserStatus.DISABLED) {
      throw forbidden("This account has been disabled. Speak to the church secretary.");
    }

    const session = await issueSession(user.id, req.headers["user-agent"]);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    res.json({
      data: {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        user: presentUser(session.user),
      },
    });
  },
);

authRouter.post(
  "/refresh",
  validate({ body: z.object({ refreshToken: z.string().min(1) }) }),
  async (req, res) => {
    const { refreshToken } = req.body as { refreshToken: string };

    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: { user: { include: { roles: true } } },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw unauthorized("Your session has expired. Please sign in again.");
    }
    if (session.user.status !== UserStatus.ACTIVE) {
      throw forbidden("This account is no longer active.");
    }

    // Rotate: the presented token is retired as the new one is issued.
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const next = await issueSession(session.userId, req.headers["user-agent"]);

    res.json({
      data: {
        accessToken: next.accessToken,
        refreshToken: next.refreshToken,
        user: presentUser(next.user),
      },
    });
  },
);

authRouter.post(
  "/logout",
  validate({ body: z.object({ refreshToken: z.string().min(1) }) }),
  async (req, res) => {
    await prisma.session.updateMany({
      where: { refreshToken: (req.body as { refreshToken: string }).refreshToken },
      data: { revokedAt: new Date() },
    });
    res.status(204).send();
  },
);

// --- password ------------------------------------------------------------

authRouter.post(
  "/forgot-password",
  validate({ body: z.object({ email: z.email("Enter a valid email address") }) }),
  async (req, res) => {
    const { email } = req.body as { email: string };
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const token = generateResetToken();
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      // TODO: hand `token` to the mailer once outbound email is wired up. Never
      // logged, for the same reason as the verification code.
      console.log(`[dev] password reset token issued for user ${user.id}`);
    }

    // Always the same answer, so the form cannot confirm who has an account.
    res.json({
      message: "If that email is on file, a reset link is on its way.",
    });
  },
);

authRouter.post(
  "/reset-password",
  validate({ body: z.object({ token: z.string().min(1), password }) }),
  async (req, res) => {
    const { token, password: plain } = req.body as { token: string; password: string };

    const row = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!row || row.usedAt) throw badRequest("That reset link is no longer valid.");
    if (row.expiresAt < new Date()) throw badRequest("That reset link has expired.");

    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash: await hashPassword(plain) },
      }),
      prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
      // Every existing session goes with the old password.
      prisma.session.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    res.json({ message: "Your password has been changed. Please sign in." });
  },
);

// --- profile -------------------------------------------------------------

authRouter.get("/me", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    include: { roles: true },
  });
  if (!user) throw notFound("That account");

  res.json({ data: presentUser(user) });
});

authRouter.post(
  "/change-password",
  authenticate,
  validate({
    body: z.object({
      currentPassword: z.string().min(1, "Enter your current password"),
      newPassword: password,
    }),
  }),
  async (req, res) => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw badRequest("That is not your current password.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });

    res.json({ message: "Your password has been changed." });
  },
);
