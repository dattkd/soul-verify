-- CreateTable
CREATE TABLE "VerificationJob" (
    "id" TEXT NOT NULL,
    "inputType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "canonicalUrl" TEXT,
    "platform" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "errorMessage" TEXT,
    "requestedByProvider" TEXT,
    "requestedByHandle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "VerificationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "originalFilename" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "storageKey" TEXT,
    "sha256" TEXT,
    "perceptualHash" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "codec" TEXT,
    "exifJson" JSONB,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DerivedArtifact" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "storageKey" TEXT,
    "sequenceIndex" INTEGER,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DerivedArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisResult" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "summaryJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceSignal" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "scoreImpact" INTEGER NOT NULL DEFAULT 0,
    "detailsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicReport" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "slug" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "externalEventId" TEXT,
    "jobId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderAccount" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvenanceRecord" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "signatureType" TEXT,
    "signer" TEXT,
    "status" TEXT NOT NULL DEFAULT 'not_found',
    "detailsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProvenanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisResult_jobId_key" ON "AnalysisResult"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicReport_jobId_key" ON "PublicReport"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicReport_publicToken_key" ON "PublicReport"("publicToken");

-- CreateIndex
CREATE UNIQUE INDEX "PublicReport_slug_key" ON "PublicReport"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAccount_provider_handle_key" ON "ProviderAccount"("provider", "handle");

-- CreateIndex
CREATE UNIQUE INDEX "ProvenanceRecord_assetId_key" ON "ProvenanceRecord"("assetId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "VerificationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DerivedArtifact" ADD CONSTRAINT "DerivedArtifact_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisResult" ADD CONSTRAINT "AnalysisResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "VerificationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceSignal" ADD CONSTRAINT "EvidenceSignal_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "VerificationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicReport" ADD CONSTRAINT "PublicReport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "VerificationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformEvent" ADD CONSTRAINT "PlatformEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "VerificationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvenanceRecord" ADD CONSTRAINT "ProvenanceRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
