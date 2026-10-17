-- CreateEnum
CREATE TYPE "ChurchStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('TREASURER', 'SECRETARY', 'PASTOR', 'DEPARTMENT_LEADER', 'USHER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'PENDING_APPROVAL', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "MemberKind" AS ENUM ('MEMBER', 'FIRST_TIMER');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ServiceKind" AS ENUM ('SUNDAY_FIRST', 'SUNDAY_SECOND', 'MIDWEEK', 'VIGIL', 'CONVENTION', 'SPECIAL');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('USHER', 'SECRETARY');

-- CreateEnum
CREATE TYPE "OfferingStatus" AS ENUM ('DRAFT', 'FINALIZED', 'APPROVED', 'REVISED');

-- CreateEnum
CREATE TYPE "FinancialReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "ReportKind" AS ENUM ('WEEKLY', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "DepartmentReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('READY', 'DUPLICATE', 'MISSING_SEX', 'MISSING_NAME', 'IMPORTED', 'SKIPPED', 'MERGED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'WHATSAPP');

-- CreateTable
CREATE TABLE "Church" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "ChurchStatus" NOT NULL DEFAULT 'ACTIVE',
    "logoFileId" TEXT,
    "accentSet" TEXT NOT NULL DEFAULT 'default',
    "enabledModules" TEXT[],
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Church_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "emailVerifiedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "disabledAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "departmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "sex" "Sex",
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "kind" "MemberKind" NOT NULL DEFAULT 'MEMBER',
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "notes" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentMember" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ServiceKind" NOT NULL,
    "heldOn" DATE NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "source" "AttendanceSource" NOT NULL DEFAULT 'USHER',
    "markedById" TEXT,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedOfflineAt" TIMESTAMP(3),

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceSummary" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "men" INTEGER NOT NULL DEFAULT 0,
    "women" INTEGER NOT NULL DEFAULT 0,
    "children" INTEGER NOT NULL DEFAULT 0,
    "firstTimers" INTEGER NOT NULL DEFAULT 0,
    "compiledById" TEXT,
    "compiledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offering" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "status" "OfferingStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "recordedById" TEXT,
    "finalizedById" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferingCategory" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isCash" BOOLEAN NOT NULL DEFAULT true,
    "bucketRateSnapshot" DECIMAL(5,2),
    "transferAmountKobo" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferingCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DenominationCount" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "denomination" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DenominationCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferingRevision" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "categoryName" TEXT,
    "deltaAmountKobo" INTEGER NOT NULL,
    "originalTotalKobo" INTEGER NOT NULL,
    "revisedTotalKobo" INTEGER NOT NULL,
    "recordedById" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferingRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeCategory" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isCashByDefault" BOOLEAN NOT NULL DEFAULT true,
    "bucketRatePercent" DECIMAL(5,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyFinancialReport" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "status" "FinancialReportStatus" NOT NULL DEFAULT 'DRAFT',
    "narrative" TEXT,
    "preparedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyFinancialReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyExpense" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "preparedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseItem" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExpenseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalComment" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "financialReportId" TEXT,
    "weeklyExpenseId" TEXT,
    "offeringId" TEXT,
    "departmentReportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentReport" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "kind" "ReportKind" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "DepartmentReportStatus" NOT NULL DEFAULT 'DRAFT',
    "attendanceCount" INTEGER,
    "offeringAmountKobo" INTEGER,
    "visitorCount" INTEGER,
    "achievements" TEXT,
    "projections" TEXT,
    "challenges" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "returnNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberImport" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MemberImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberImportRow" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawFirstName" TEXT,
    "rawLastName" TEXT,
    "rawSex" TEXT,
    "rawPhone" TEXT,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'READY',
    "duplicateOfMemberId" TEXT,
    "resolvedMemberId" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "MemberImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkPath" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Church_slug_key" ON "Church"("slug");

-- CreateIndex
CREATE INDEX "Church_status_idx" ON "Church"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "UserRole_role_idx" ON "UserRole"("role");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_role_departmentId_key" ON "UserRole"("userId", "role", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshToken_key" ON "Session"("refreshToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_token_key" ON "EmailVerificationToken"("token");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Member_lastName_firstName_idx" ON "Member"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Member_kind_status_idx" ON "Member"("kind", "status");

-- CreateIndex
CREATE INDEX "Member_phone_idx" ON "Member"("phone");

-- CreateIndex
CREATE INDEX "Member_churchId_idx" ON "Member"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_churchId_id_key" ON "Member"("churchId", "id");

-- CreateIndex
CREATE INDEX "Department_churchId_idx" ON "Department"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_churchId_name_key" ON "Department"("churchId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_churchId_id_key" ON "Department"("churchId", "id");

-- CreateIndex
CREATE INDEX "DepartmentMember_churchId_idx" ON "DepartmentMember"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentMember_departmentId_memberId_key" ON "DepartmentMember"("departmentId", "memberId");

-- CreateIndex
CREATE INDEX "Service_heldOn_idx" ON "Service"("heldOn");

-- CreateIndex
CREATE INDEX "Service_churchId_idx" ON "Service"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "Service_churchId_heldOn_kind_key" ON "Service"("churchId", "heldOn", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Service_churchId_id_key" ON "Service"("churchId", "id");

-- CreateIndex
CREATE INDEX "AttendanceRecord_serviceId_idx" ON "AttendanceRecord"("serviceId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_memberId_idx" ON "AttendanceRecord"("memberId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_churchId_idx" ON "AttendanceRecord"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_serviceId_memberId_key" ON "AttendanceRecord"("serviceId", "memberId");

-- CreateIndex
CREATE INDEX "AttendanceSummary_churchId_idx" ON "AttendanceSummary"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceSummary_churchId_serviceId_key" ON "AttendanceSummary"("churchId", "serviceId");

-- CreateIndex
CREATE INDEX "Offering_status_idx" ON "Offering"("status");

-- CreateIndex
CREATE INDEX "Offering_churchId_idx" ON "Offering"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "Offering_churchId_id_key" ON "Offering"("churchId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Offering_churchId_serviceId_key" ON "Offering"("churchId", "serviceId");

-- CreateIndex
CREATE INDEX "OfferingCategory_offeringId_idx" ON "OfferingCategory"("offeringId");

-- CreateIndex
CREATE INDEX "OfferingCategory_churchId_idx" ON "OfferingCategory"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferingCategory_offeringId_name_key" ON "OfferingCategory"("offeringId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "OfferingCategory_churchId_id_key" ON "OfferingCategory"("churchId", "id");

-- CreateIndex
CREATE INDEX "DenominationCount_categoryId_idx" ON "DenominationCount"("categoryId");

-- CreateIndex
CREATE INDEX "DenominationCount_churchId_idx" ON "DenominationCount"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "DenominationCount_categoryId_denomination_key" ON "DenominationCount"("categoryId", "denomination");

-- CreateIndex
CREATE INDEX "OfferingRevision_offeringId_idx" ON "OfferingRevision"("offeringId");

-- CreateIndex
CREATE INDEX "OfferingRevision_churchId_idx" ON "OfferingRevision"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferingRevision_offeringId_idempotencyKey_key" ON "OfferingRevision"("offeringId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "IncomeCategory_churchId_idx" ON "IncomeCategory"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeCategory_churchId_name_key" ON "IncomeCategory"("churchId", "name");

-- CreateIndex
CREATE INDEX "WeeklyFinancialReport_status_idx" ON "WeeklyFinancialReport"("status");

-- CreateIndex
CREATE INDEX "WeeklyFinancialReport_churchId_idx" ON "WeeklyFinancialReport"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyFinancialReport_churchId_weekStart_key" ON "WeeklyFinancialReport"("churchId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyFinancialReport_churchId_id_key" ON "WeeklyFinancialReport"("churchId", "id");

-- CreateIndex
CREATE INDEX "WeeklyExpense_status_idx" ON "WeeklyExpense"("status");

-- CreateIndex
CREATE INDEX "WeeklyExpense_churchId_idx" ON "WeeklyExpense"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyExpense_churchId_weekStart_key" ON "WeeklyExpense"("churchId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyExpense_churchId_id_key" ON "WeeklyExpense"("churchId", "id");

-- CreateIndex
CREATE INDEX "ExpenseItem_expenseId_idx" ON "ExpenseItem"("expenseId");

-- CreateIndex
CREATE INDEX "ExpenseItem_churchId_idx" ON "ExpenseItem"("churchId");

-- CreateIndex
CREATE INDEX "ApprovalComment_financialReportId_idx" ON "ApprovalComment"("financialReportId");

-- CreateIndex
CREATE INDEX "ApprovalComment_weeklyExpenseId_idx" ON "ApprovalComment"("weeklyExpenseId");

-- CreateIndex
CREATE INDEX "ApprovalComment_offeringId_idx" ON "ApprovalComment"("offeringId");

-- CreateIndex
CREATE INDEX "ApprovalComment_departmentReportId_idx" ON "ApprovalComment"("departmentReportId");

-- CreateIndex
CREATE INDEX "ApprovalComment_churchId_idx" ON "ApprovalComment"("churchId");

-- CreateIndex
CREATE INDEX "DepartmentReport_status_idx" ON "DepartmentReport"("status");

-- CreateIndex
CREATE INDEX "DepartmentReport_departmentId_kind_idx" ON "DepartmentReport"("departmentId", "kind");

-- CreateIndex
CREATE INDEX "DepartmentReport_churchId_idx" ON "DepartmentReport"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentReport_departmentId_kind_periodStart_key" ON "DepartmentReport"("departmentId", "kind", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentReport_churchId_id_key" ON "DepartmentReport"("churchId", "id");

-- CreateIndex
CREATE INDEX "MemberImport_churchId_idx" ON "MemberImport"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberImport_churchId_id_key" ON "MemberImport"("churchId", "id");

-- CreateIndex
CREATE INDEX "MemberImportRow_importId_status_idx" ON "MemberImportRow"("importId", "status");

-- CreateIndex
CREATE INDEX "MemberImportRow_churchId_idx" ON "MemberImportRow"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberImportRow_importId_rowNumber_key" ON "MemberImportRow"("importId", "rowNumber");

-- CreateIndex
CREATE INDEX "Notification_userId_sentAt_idx" ON "Notification"("userId", "sentAt");

-- CreateIndex
CREATE INDEX "Notification_churchId_idx" ON "Notification"("churchId");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_churchId_idx" ON "AuditEvent"("churchId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentMember" ADD CONSTRAINT "DepartmentMember_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentMember" ADD CONSTRAINT "DepartmentMember_churchId_departmentId_fkey" FOREIGN KEY ("churchId", "departmentId") REFERENCES "Department"("churchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentMember" ADD CONSTRAINT "DepartmentMember_churchId_memberId_fkey" FOREIGN KEY ("churchId", "memberId") REFERENCES "Member"("churchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_churchId_serviceId_fkey" FOREIGN KEY ("churchId", "serviceId") REFERENCES "Service"("churchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_churchId_memberId_fkey" FOREIGN KEY ("churchId", "memberId") REFERENCES "Member"("churchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSummary" ADD CONSTRAINT "AttendanceSummary_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSummary" ADD CONSTRAINT "AttendanceSummary_churchId_serviceId_fkey" FOREIGN KEY ("churchId", "serviceId") REFERENCES "Service"("churchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSummary" ADD CONSTRAINT "AttendanceSummary_compiledById_fkey" FOREIGN KEY ("compiledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offering" ADD CONSTRAINT "Offering_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offering" ADD CONSTRAINT "Offering_churchId_serviceId_fkey" FOREIGN KEY ("churchId", "serviceId") REFERENCES "Service"("churchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offering" ADD CONSTRAINT "Offering_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offering" ADD CONSTRAINT "Offering_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offering" ADD CONSTRAINT "Offering_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingCategory" ADD CONSTRAINT "OfferingCategory_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingCategory" ADD CONSTRAINT "OfferingCategory_churchId_offeringId_fkey" FOREIGN KEY ("churchId", "offeringId") REFERENCES "Offering"("churchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DenominationCount" ADD CONSTRAINT "DenominationCount_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DenominationCount" ADD CONSTRAINT "DenominationCount_churchId_categoryId_fkey" FOREIGN KEY ("churchId", "categoryId") REFERENCES "OfferingCategory"("churchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingRevision" ADD CONSTRAINT "OfferingRevision_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingRevision" ADD CONSTRAINT "OfferingRevision_churchId_offeringId_fkey" FOREIGN KEY ("churchId", "offeringId") REFERENCES "Offering"("churchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingRevision" ADD CONSTRAINT "OfferingRevision_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeCategory" ADD CONSTRAINT "IncomeCategory_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeCategory" ADD CONSTRAINT "IncomeCategory_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyFinancialReport" ADD CONSTRAINT "WeeklyFinancialReport_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyFinancialReport" ADD CONSTRAINT "WeeklyFinancialReport_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyFinancialReport" ADD CONSTRAINT "WeeklyFinancialReport_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyExpense" ADD CONSTRAINT "WeeklyExpense_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyExpense" ADD CONSTRAINT "WeeklyExpense_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyExpense" ADD CONSTRAINT "WeeklyExpense_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "ExpenseItem_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "ExpenseItem_churchId_expenseId_fkey" FOREIGN KEY ("churchId", "expenseId") REFERENCES "WeeklyExpense"("churchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalComment" ADD CONSTRAINT "ApprovalComment_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalComment" ADD CONSTRAINT "ApprovalComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalComment" ADD CONSTRAINT "ApprovalComment_churchId_financialReportId_fkey" FOREIGN KEY ("churchId", "financialReportId") REFERENCES "WeeklyFinancialReport"("churchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalComment" ADD CONSTRAINT "ApprovalComment_churchId_weeklyExpenseId_fkey" FOREIGN KEY ("churchId", "weeklyExpenseId") REFERENCES "WeeklyExpense"("churchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalComment" ADD CONSTRAINT "ApprovalComment_churchId_offeringId_fkey" FOREIGN KEY ("churchId", "offeringId") REFERENCES "Offering"("churchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalComment" ADD CONSTRAINT "ApprovalComment_churchId_departmentReportId_fkey" FOREIGN KEY ("churchId", "departmentReportId") REFERENCES "DepartmentReport"("churchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentReport" ADD CONSTRAINT "DepartmentReport_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentReport" ADD CONSTRAINT "DepartmentReport_churchId_departmentId_fkey" FOREIGN KEY ("churchId", "departmentId") REFERENCES "Department"("churchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentReport" ADD CONSTRAINT "DepartmentReport_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentReport" ADD CONSTRAINT "DepartmentReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberImport" ADD CONSTRAINT "MemberImport_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberImport" ADD CONSTRAINT "MemberImport_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberImportRow" ADD CONSTRAINT "MemberImportRow_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberImportRow" ADD CONSTRAINT "MemberImportRow_churchId_importId_fkey" FOREIGN KEY ("churchId", "importId") REFERENCES "MemberImport"("churchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberImportRow" ADD CONSTRAINT "MemberImportRow_duplicateOfMemberId_fkey" FOREIGN KEY ("duplicateOfMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberImportRow" ADD CONSTRAINT "MemberImportRow_resolvedMemberId_fkey" FOREIGN KEY ("resolvedMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberImportRow" ADD CONSTRAINT "MemberImportRow_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
