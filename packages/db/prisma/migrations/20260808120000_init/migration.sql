-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MODERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ServerStatus" AS ENUM ('OFFLINE', 'STARTING', 'ONLINE', 'STOPPING', 'ERROR', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ModerationType" AS ENUM ('WARN', 'MUTE', 'KICK', 'BAN', 'NOTE');

-- CreateEnum
CREATE TYPE "HostProviderType" AS ENUM ('DOCKER_AGENT', 'PTERODACTYL', 'DIRECT_RCON_SSH');

-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "username" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_nodes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "secretTokenHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "ipAddress" TEXT,
    "hostname" TEXT,
    "os" TEXT,
    "arch" TEXT,
    "cpuCores" INTEGER,
    "totalMemoryMb" INTEGER,
    "lastHeartbeat" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bedrock_servers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'VANILLA',
    "hostProvider" "HostProviderType" NOT NULL DEFAULT 'DOCKER_AGENT',
    "version" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 19132,
    "rconPort" INTEGER DEFAULT 19133,
    "rconPassword" TEXT,
    "serverPath" TEXT NOT NULL,
    "status" "ServerStatus" NOT NULL DEFAULT 'OFFLINE',
    "maxPlayers" INTEGER NOT NULL DEFAULT 10,
    "gameMode" TEXT NOT NULL DEFAULT 'survival',
    "difficulty" TEXT NOT NULL DEFAULT 'easy',
    "ownerId" TEXT,
    "agentId" TEXT,
    "agentTunnelId" TEXT,
    "pterodactylServerId" TEXT,
    "autoUpdate" BOOLEAN NOT NULL DEFAULT false,
    "lastCrashAt" TIMESTAMP(3),
    "crashCount24h" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bedrock_servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection_keys" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connection_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_members" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_records" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "fileSizeBytes" BIGINT NOT NULL DEFAULT 0,
    "storageUrl" TEXT,
    "storagePath" TEXT NOT NULL,
    "sha256" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "status" "BackupStatus" NOT NULL DEFAULT 'PENDING',
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "isHoldCheckpoint" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "bdsVersion" TEXT,
    "manifestJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" TEXT NOT NULL,
    "serverId" TEXT,
    "playerXuid" TEXT,
    "gamertag" TEXT NOT NULL,
    "actionType" "ModerationType" NOT NULL,
    "reason" TEXT NOT NULL,
    "issuerId" TEXT,
    "issuerName" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bds_versions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "downloadUrl" TEXT NOT NULL,
    "releaseDate" TIMESTAMP(3) NOT NULL,
    "isLatest" BOOLEAN NOT NULL DEFAULT false,
    "isSupported" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "bds_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "bdsVersion" TEXT NOT NULL,
    "defaultProperties" JSONB NOT NULL,
    "addonPacks" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipelines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_runs" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "serverId" TEXT,
    "status" "PipelineStatus" NOT NULL DEFAULT 'PENDING',
    "logs" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "pipeline_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "connection_keys_key_key" ON "connection_keys"("key");

-- CreateIndex
CREATE UNIQUE INDEX "server_members_serverId_userId_key" ON "server_members"("serverId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "bds_versions_version_key" ON "bds_versions"("version");

-- AddForeignKey
ALTER TABLE "bedrock_servers" ADD CONSTRAINT "bedrock_servers_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agent_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_keys" ADD CONSTRAINT "connection_keys_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "bedrock_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_members" ADD CONSTRAINT "server_members_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "bedrock_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_members" ADD CONSTRAINT "server_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_records" ADD CONSTRAINT "backup_records_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "bedrock_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "bedrock_servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "bedrock_servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
