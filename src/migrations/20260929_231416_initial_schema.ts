import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`users_sessions\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`created_at\` text,
  	\`expires_at\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`users_sessions_order_idx\` ON \`users_sessions\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`users_sessions_parent_id_idx\` ON \`users_sessions\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`users\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`email\` text NOT NULL,
  	\`reset_password_token\` text,
  	\`reset_password_expiration\` text,
  	\`salt\` text,
  	\`hash\` text,
  	\`login_attempts\` numeric DEFAULT 0,
  	\`lock_until\` text
  );
  `)
  await db.run(sql`CREATE INDEX \`users_updated_at_idx\` ON \`users\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`users_created_at_idx\` ON \`users\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);`)
  await db.run(sql`CREATE TABLE \`websites\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`owner_id\` integer NOT NULL,
  	\`phase\` text DEFAULT 'intake',
  	\`worker_url\` text,
  	\`admin_url\` text,
  	\`domain_status\` text DEFAULT 'not_connected',
  	\`tenant_id\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`websites_slug_idx\` ON \`websites\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`websites_owner_idx\` ON \`websites\` (\`owner_id\`);`)
  await db.run(sql`CREATE INDEX \`websites_updated_at_idx\` ON \`websites\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`websites_created_at_idx\` ON \`websites\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`bootstrap_jobs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`website_id\` integer NOT NULL,
  	\`step\` text DEFAULT 'requested',
  	\`status\` text DEFAULT 'queued',
  	\`retries\` numeric DEFAULT 0,
  	\`resource_receipts\` text,
  	\`diagnostic\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`website_id\`) REFERENCES \`websites\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`bootstrap_jobs_website_idx\` ON \`bootstrap_jobs\` (\`website_id\`);`)
  await db.run(sql`CREATE INDEX \`bootstrap_jobs_updated_at_idx\` ON \`bootstrap_jobs\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`bootstrap_jobs_created_at_idx\` ON \`bootstrap_jobs\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`operations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`website_id\` integer NOT NULL,
  	\`tool\` text NOT NULL,
  	\`origin\` text NOT NULL,
  	\`status\` text NOT NULL,
  	\`input_hash\` text NOT NULL,
  	\`source_action_id\` text,
  	\`reason\` text,
  	\`outcome\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`website_id\`) REFERENCES \`websites\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`operations_website_idx\` ON \`operations\` (\`website_id\`);`)
  await db.run(sql`CREATE INDEX \`operations_updated_at_idx\` ON \`operations\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`operations_created_at_idx\` ON \`operations\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`revisions\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`website_id\` integer NOT NULL,
  	\`operation_id\` integer,
  	\`summary\` text NOT NULL,
  	\`source_identity\` text,
  	\`worker_url\` text,
  	\`rollback_of_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`website_id\`) REFERENCES \`websites\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`operation_id\`) REFERENCES \`operations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`rollback_of_id\`) REFERENCES \`revisions\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`revisions_website_idx\` ON \`revisions\` (\`website_id\`);`)
  await db.run(sql`CREATE INDEX \`revisions_operation_idx\` ON \`revisions\` (\`operation_id\`);`)
  await db.run(sql`CREATE INDEX \`revisions_rollback_of_idx\` ON \`revisions\` (\`rollback_of_id\`);`)
  await db.run(sql`CREATE INDEX \`revisions_updated_at_idx\` ON \`revisions\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`revisions_created_at_idx\` ON \`revisions\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_kv\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text NOT NULL,
  	\`data\` text NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`payload_kv_key_idx\` ON \`payload_kv\` (\`key\`);`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`global_slug\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_global_slug_idx\` ON \`payload_locked_documents\` (\`global_slug\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_updated_at_idx\` ON \`payload_locked_documents\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_created_at_idx\` ON \`payload_locked_documents\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`websites_id\` integer,
  	\`bootstrap_jobs_id\` integer,
  	\`operations_id\` integer,
  	\`revisions_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`websites_id\`) REFERENCES \`websites\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`bootstrap_jobs_id\`) REFERENCES \`bootstrap_jobs\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`operations_id\`) REFERENCES \`operations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`revisions_id\`) REFERENCES \`revisions\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_websites_id_idx\` ON \`payload_locked_documents_rels\` (\`websites_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_bootstrap_jobs_id_idx\` ON \`payload_locked_documents_rels\` (\`bootstrap_jobs_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_operations_id_idx\` ON \`payload_locked_documents_rels\` (\`operations_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_revisions_id_idx\` ON \`payload_locked_documents_rels\` (\`revisions_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_preferences\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text,
  	\`value\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_preferences_key_idx\` ON \`payload_preferences\` (\`key\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_updated_at_idx\` ON \`payload_preferences\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_created_at_idx\` ON \`payload_preferences\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_preferences_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_preferences\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_order_idx\` ON \`payload_preferences_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_parent_idx\` ON \`payload_preferences_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_path_idx\` ON \`payload_preferences_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_users_id_idx\` ON \`payload_preferences_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_migrations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`batch\` numeric,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_migrations_updated_at_idx\` ON \`payload_migrations\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_migrations_created_at_idx\` ON \`payload_migrations\` (\`created_at\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`users_sessions\`;`)
  await db.run(sql`DROP TABLE \`users\`;`)
  await db.run(sql`DROP TABLE \`websites\`;`)
  await db.run(sql`DROP TABLE \`bootstrap_jobs\`;`)
  await db.run(sql`DROP TABLE \`operations\`;`)
  await db.run(sql`DROP TABLE \`revisions\`;`)
  await db.run(sql`DROP TABLE \`payload_kv\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_migrations\`;`)
}
