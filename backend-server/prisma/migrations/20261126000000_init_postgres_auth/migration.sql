-- Initial PostgreSQL schema for the multi-user backend.
-- Legacy SQLite migrations live under prisma/legacy-sqlite-migrations/ and are not applied.

CREATE TYPE "TaskStatus" AS ENUM ('queued', 'running', 'success', 'failed', 'cancelled');
CREATE TYPE "FileParseStatus" AS ENUM ('pending', 'processing', 'failed', 'indexed');
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant');

CREATE TABLE "app_users" (
    "id" TEXT NOT NULL,
    "browser_fingerprint_hash" TEXT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_files" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_md5" TEXT,
    "file_size_bytes" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "parse_status" "FileParseStatus" NOT NULL DEFAULT 'pending',
    "parse_version" INTEGER NOT NULL DEFAULT 1,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "indexed_at" TIMESTAMP(3),
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ingestion_tasks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'queued',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ingestion_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "file_chunks" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "vector_id" TEXT NOT NULL,
    "collection_name" TEXT NOT NULL,
    "chunk_hash" TEXT NOT NULL,
    "content_preview" TEXT NOT NULL,
    "page_number" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "file_chunks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "sources_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_users_browser_fingerprint_hash_key" ON "app_users"("browser_fingerprint_hash");
CREATE UNIQUE INDEX "app_users_email_key" ON "app_users"("email");

CREATE UNIQUE INDEX "uk_knowledge_files_user_md5" ON "knowledge_files"("user_id", "content_md5");
CREATE INDEX "idx_knowledge_files_user_status_uploaded" ON "knowledge_files"("user_id", "parse_status", "uploaded_at");

CREATE INDEX "idx_ingestion_tasks_user_status_created" ON "ingestion_tasks"("user_id", "status", "created_at");
CREATE INDEX "idx_ingestion_tasks_file" ON "ingestion_tasks"("file_id");
CREATE INDEX "idx_ingestion_tasks_retry" ON "ingestion_tasks"("status", "next_retry_at");

CREATE UNIQUE INDEX "file_chunks_vector_id_key" ON "file_chunks"("vector_id");
CREATE UNIQUE INDEX "file_chunks_file_id_chunk_index_key" ON "file_chunks"("file_id", "chunk_index");
CREATE INDEX "idx_file_chunks_file_order" ON "file_chunks"("file_id", "chunk_index");

CREATE INDEX "idx_chat_sessions_user_last_message" ON "chat_sessions"("user_id", "created_at");
CREATE INDEX "idx_chat_messages_session_created" ON "chat_messages"("session_id", "created_at");

ALTER TABLE "knowledge_files" ADD CONSTRAINT "knowledge_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ingestion_tasks" ADD CONSTRAINT "ingestion_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ingestion_tasks" ADD CONSTRAINT "ingestion_tasks_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "knowledge_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "file_chunks" ADD CONSTRAINT "file_chunks_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "knowledge_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
