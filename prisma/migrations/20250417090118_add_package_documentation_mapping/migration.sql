-- CreateTable
CREATE TABLE "packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "description" TEXT,
    "repository" TEXT,
    "homepage" TEXT,
    "popularity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_versions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "release_date" TIMESTAMP(3),
    "is_latest" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "package_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_documentation_mappings" (
    "id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "version_id" TEXT,
    "document_id" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "source_url" TEXT,
    "source_reliability" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "source_is_official" BOOLEAN NOT NULL DEFAULT false,
    "relevance_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "is_api_doc" BOOLEAN NOT NULL DEFAULT false,
    "is_guide" BOOLEAN NOT NULL DEFAULT false,
    "is_homepage" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "package_documentation_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentation_cache" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documentation_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "packages_name_key" ON "packages"("name");

-- CreateIndex
CREATE INDEX "packages_name_idx" ON "packages"("name");

-- CreateIndex
CREATE INDEX "packages_language_idx" ON "packages"("language");

-- CreateIndex
CREATE INDEX "packages_popularity_idx" ON "packages"("popularity");

-- CreateIndex
CREATE INDEX "package_versions_version_idx" ON "package_versions"("version");

-- CreateIndex
CREATE INDEX "package_versions_is_latest_idx" ON "package_versions"("is_latest");

-- CreateIndex
CREATE UNIQUE INDEX "package_versions_package_id_version_key" ON "package_versions"("package_id", "version");

-- CreateIndex
CREATE INDEX "package_documentation_mappings_relevance_score_idx" ON "package_documentation_mappings"("relevance_score");

-- CreateIndex
CREATE INDEX "package_documentation_mappings_source_name_idx" ON "package_documentation_mappings"("source_name");

-- CreateIndex
CREATE INDEX "package_documentation_mappings_source_is_official_idx" ON "package_documentation_mappings"("source_is_official");

-- CreateIndex
CREATE UNIQUE INDEX "package_documentation_mappings_package_id_document_id_key" ON "package_documentation_mappings"("package_id", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "documentation_cache_key_key" ON "documentation_cache"("key");

-- CreateIndex
CREATE INDEX "documentation_cache_key_idx" ON "documentation_cache"("key");

-- CreateIndex
CREATE INDEX "documentation_cache_expires_at_idx" ON "documentation_cache"("expires_at");

-- AddForeignKey
ALTER TABLE "package_versions" ADD CONSTRAINT "package_versions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_documentation_mappings" ADD CONSTRAINT "package_documentation_mappings_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_documentation_mappings" ADD CONSTRAINT "package_documentation_mappings_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "package_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_documentation_mappings" ADD CONSTRAINT "package_documentation_mappings_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
