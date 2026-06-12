-- CreateTable
CREATE TABLE "App" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "apiKeyHash" TEXT NOT NULL,
    "apiKeyPrefix" TEXT NOT NULL,
    "ownerEmail" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AppOpenEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department" TEXT,
    "sessionId" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppOpenEvent_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeatureEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appId" TEXT NOT NULL,
    "featureName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeatureEvent_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TagEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TagEvent_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "App_name_key" ON "App"("name");

-- CreateIndex
CREATE UNIQUE INDEX "App_apiKeyHash_key" ON "App"("apiKeyHash");

-- CreateIndex
CREATE INDEX "App_name_idx" ON "App"("name");

-- CreateIndex
CREATE INDEX "App_active_idx" ON "App"("active");

-- CreateIndex
CREATE INDEX "AppOpenEvent_appId_createdAt_idx" ON "AppOpenEvent"("appId", "createdAt");

-- CreateIndex
CREATE INDEX "AppOpenEvent_appId_email_idx" ON "AppOpenEvent"("appId", "email");

-- CreateIndex
CREATE INDEX "AppOpenEvent_department_idx" ON "AppOpenEvent"("department");

-- CreateIndex
CREATE INDEX "AppOpenEvent_createdAt_idx" ON "AppOpenEvent"("createdAt");

-- CreateIndex
CREATE INDEX "FeatureEvent_appId_featureName_createdAt_idx" ON "FeatureEvent"("appId", "featureName", "createdAt");

-- CreateIndex
CREATE INDEX "FeatureEvent_appId_email_idx" ON "FeatureEvent"("appId", "email");

-- CreateIndex
CREATE INDEX "FeatureEvent_department_idx" ON "FeatureEvent"("department");

-- CreateIndex
CREATE INDEX "FeatureEvent_createdAt_idx" ON "FeatureEvent"("createdAt");

-- CreateIndex
CREATE INDEX "TagEvent_appId_tag_createdAt_idx" ON "TagEvent"("appId", "tag", "createdAt");

-- CreateIndex
CREATE INDEX "TagEvent_appId_email_idx" ON "TagEvent"("appId", "email");

-- CreateIndex
CREATE INDEX "TagEvent_department_idx" ON "TagEvent"("department");

-- CreateIndex
CREATE INDEX "TagEvent_createdAt_idx" ON "TagEvent"("createdAt");
