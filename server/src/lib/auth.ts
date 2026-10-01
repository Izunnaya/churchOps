import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "./env";
import { Role } from "../generated/prisma/enums";

const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export type AccessTokenPayload = {
  sub: string;
  roles: Role[];
  /// Departments this user leads, for scoping a leader to their own reports.
  departmentIds: string[];
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.accessTokenTtl,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
}

/// Opaque, stored hashed-by-uniqueness in Session.refreshToken.
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

/// Short, human-readable code for the email verification screen.
export function generateVerificationCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function refreshTokenExpiry(): Date {
  const expires = new Date();
  expires.setDate(expires.getDate() + env.refreshTokenTtlDays);
  return expires;
}
