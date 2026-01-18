/**
 * Memory Database - SQLite persistence layer for memory blocks
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { CreateMemoryBlock, MemoryBlock, MemoryBlockHistory, SessionMemory } from "./schema.js";

/**
 * Database operations for memory persistence
 */
export class MemoryDatabase {
	private db: Database.Database;

	constructor(databasePath: string) {
		// Ensure directory exists
		const dir = databasePath.split("/").slice(0, -1).join("/");
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}

		console.log(`[Memory DB] Opening: ${databasePath}`);
		this.db = new Database(databasePath);
		this.db.pragma("journal_mode = WAL");
		this.initSchema();
	}

	/**
	 * Initialize database schema
	 */
	private initSchema(): void {
		// Memory blocks table
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS memory_blocks (
				id TEXT PRIMARY KEY,
				session_id TEXT NOT NULL,
				label TEXT NOT NULL,
				value TEXT NOT NULL,
				description TEXT,
				char_limit INTEGER NOT NULL,
				read_only INTEGER NOT NULL DEFAULT 0,
				hidden INTEGER NOT NULL DEFAULT 0,
				metadata TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				version INTEGER NOT NULL DEFAULT 1,
				UNIQUE(session_id, label)
			)
		`);

		// Memory block history table
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS memory_block_history (
				id TEXT PRIMARY KEY,
				block_id TEXT NOT NULL,
				label TEXT NOT NULL,
				value TEXT NOT NULL,
				version INTEGER NOT NULL,
				created_at TEXT NOT NULL,
				created_by TEXT NOT NULL,
				FOREIGN KEY (block_id) REFERENCES memory_blocks(id) ON DELETE CASCADE
			)
		`);

		// Indexes
		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_memory_blocks_session_id ON memory_blocks(session_id);
			CREATE INDEX IF NOT EXISTS idx_memory_blocks_created_at ON memory_blocks(created_at);
			CREATE INDEX IF NOT EXISTS idx_memory_block_history_block_id ON memory_block_history(block_id);
		`);
	}

	/**
	 * Get all memory blocks for a session
	 */
	getBlocksForSession(sessionId: string): MemoryBlock[] {
		const stmt = this.db.prepare(`
			SELECT
				id,
				label,
				value,
				description,
				char_limit as charLimit,
				read_only as readOnly,
				hidden,
				metadata,
				created_at as createdAt,
				updated_at as updatedAt,
				version
			FROM memory_blocks
			WHERE session_id = ?
			ORDER BY label
		`);

		const rows = stmt.all(sessionId) as any[];
		return rows.map((row) => ({
			...row,
			readOnly: row.readOnly === 1,
			hidden: row.hidden === 1,
			metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
		}));
	}

	/**
	 * Get a single memory block by label
	 */
	getBlockByLabel(sessionId: string, label: string): MemoryBlock | undefined {
		const stmt = this.db.prepare(`
			SELECT
				id,
				label,
				value,
				description,
				char_limit as charLimit,
				read_only as readOnly,
				hidden,
				metadata,
				created_at as createdAt,
				updated_at as updatedAt,
				version
			FROM memory_blocks
			WHERE session_id = ? AND label = ?
		`);

		const row = stmt.get(sessionId, label) as any;
		if (!row) {
			console.log(`[Memory DB] Retrieved block ${label}: not found`);
			return undefined;
		}

		const result = {
			...row,
			readOnly: row.readOnly === 1,
			hidden: row.hidden === 1,
			metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
		};
		console.log(`[Memory DB] Retrieved block ${label}: found`, {
			valueLength: result.value.length,
			version: result.version,
		});
		return result;
	}

	/**
	 * Create a new memory block
	 */
	createBlock(sessionId: string, block: CreateMemoryBlock): MemoryBlock {
		const id = randomUUID();
		const now = new Date().toISOString();
		const version = 1;

		const stmt = this.db.prepare(`
			INSERT INTO memory_blocks (
				id, session_id, label, value, description, char_limit,
				read_only, hidden, metadata, created_at, updated_at, version
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);

		stmt.run(
			id,
			sessionId,
			block.label,
			block.value || "",
			block.description || "",
			block.charLimit || 4000,
			block.readOnly ? 1 : 0,
			block.hidden ? 1 : 0,
			block.metadata ? JSON.stringify(block.metadata) : null,
			now,
			now,
			version,
		);

		// Create initial history entry
		this.createHistoryEntry(id, block.label, block.value || "", version, now, "agent");

		return this.getBlock(id)!;
	}

	/**
	 * Update an existing memory block
	 */
	updateBlock(sessionId: string, label: string, updates: Partial<CreateMemoryBlock>): MemoryBlock | undefined {
		const existing = this.getBlockByLabel(sessionId, label);
		if (!existing) return undefined;

		const now = new Date().toISOString();
		const newVersion = existing.version + 1;
		const newValue = updates.value ?? existing.value;

		console.log(`[Memory DB] Updating block ${label}:`, updates);

		const stmt = this.db.prepare(`
			UPDATE memory_blocks
			SET value = COALESCE(?, value),
				description = COALESCE(?, description),
				char_limit = COALESCE(?, char_limit),
				read_only = COALESCE(?, read_only),
				hidden = COALESCE(?, hidden),
				metadata = COALESCE(?, metadata),
				updated_at = ?,
				version = ?
			WHERE session_id = ? AND label = ?
		`);

		stmt.run(
			updates.value,
			updates.description,
			updates.charLimit,
			updates.readOnly !== undefined ? (updates.readOnly ? 1 : 0) : undefined,
			updates.hidden !== undefined ? (updates.hidden ? 1 : 0) : undefined,
			updates.metadata ? JSON.stringify(updates.metadata) : undefined,
			now,
			newVersion,
			sessionId,
			label,
		);

		// Create history entry for value changes
		if (updates.value !== undefined) {
			this.createHistoryEntry(existing.id, label, updates.value, newVersion, now, "agent");
		}

		return this.getBlockByLabel(sessionId, label);
	}

	/**
	 * Delete a memory block
	 */
	deleteBlock(sessionId: string, label: string): boolean {
		const stmt = this.db.prepare("DELETE FROM memory_blocks WHERE session_id = ? AND label = ?");
		const result = stmt.run(sessionId, label);
		return result.changes > 0;
	}

	/**
	 * Get a block by ID
	 */
	private getBlock(id: string): MemoryBlock | undefined {
		const stmt = this.db.prepare(`
			SELECT
				id,
				label,
				value,
				description,
				char_limit as charLimit,
				read_only as readOnly,
				hidden,
				metadata,
				created_at as createdAt,
				updated_at as updatedAt,
				version
			FROM memory_blocks
			WHERE id = ?
		`);

		const row = stmt.get(id) as any;
		if (!row) return undefined;

		return {
			...row,
			readOnly: row.readOnly === 1,
			hidden: row.hidden === 1,
			metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
		};
	}

	/**
	 * Create a history entry
	 */
	private createHistoryEntry(
		blockId: string,
		label: string,
		value: string,
		version: number,
		createdAt: string,
		createdBy: string,
	): void {
		const id = randomUUID();
		const stmt = this.db.prepare(`
			INSERT INTO memory_block_history (id, block_id, label, value, version, created_at, created_by)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`);
		stmt.run(id, blockId, label, value, version, createdAt, createdBy);
	}

	/**
	 * Get history for a block
	 */
	getBlockHistory(sessionId: string, label: string): MemoryBlockHistory[] {
		const block = this.getBlockByLabel(sessionId, label);
		if (!block) return [];

		const stmt = this.db.prepare(`
			SELECT
				id,
				block_id as blockId,
				label,
				value,
				version,
				created_at as createdAt,
				created_by as createdAtBy
			FROM memory_block_history
			WHERE block_id = ?
			ORDER BY version DESC
		`);

		return stmt.all(block.id) as MemoryBlockHistory[];
	}

	/**
	 * Get all memory for a session
	 */
	getSessionMemory(sessionId: string): SessionMemory {
		const blocks = this.getBlocksForSession(sessionId);
		const now = new Date().toISOString();

		if (blocks.length === 0) {
			return { blocks: [], createdAt: now, updatedAt: now };
		}

		const createdAt = blocks.reduce((min, b) => (b.createdAt < min ? b.createdAt : min), blocks[0].createdAt);
		const updatedAt = blocks.reduce((max, b) => (b.updatedAt > max ? b.updatedAt : max), blocks[0].updatedAt);

		return { blocks, createdAt, updatedAt };
	}

	/**
	 * Close database connection
	 */
	close(): void {
		// Flush WAL to main database before closing
		this.db.pragma("wal_checkpoint(TRUNCATE)");
		this.db.close();
	}

	/**
	 * Delete all blocks for a session
	 */
	deleteSessionMemory(sessionId: string): void {
		this.db.prepare("DELETE FROM memory_blocks WHERE session_id = ?").run(sessionId);
	}
}
