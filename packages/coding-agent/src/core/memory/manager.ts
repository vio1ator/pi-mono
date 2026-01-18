/**
 * Memory Manager - High-level API for memory block management
 */

import { compileMemory } from "./compiler.js";
import { MemoryDatabase } from "./database.js";
import type { CreateMemoryBlock, MemoryBlock, SessionMemory, UpdateMemoryBlock } from "./schema.js";

/**
 * Manager class for memory operations
 */
export class MemoryManager {
	private db: MemoryDatabase;
	private sessionId: string;
	private memoryCache: MemoryBlock[] | null = null;

	constructor(databasePath: string, sessionId: string) {
		this.db = new MemoryDatabase(databasePath);
		// Use "global" sessionId so memory persists across all sessions
		// Memory is user-global, not session-scoped
		this.sessionId = "global";
	}

	/**
	 * Load all memory blocks for the session
	 */
	load(): SessionMemory {
		const memory = this.db.getSessionMemory(this.sessionId);
		this.memoryCache = memory.blocks;
		console.log(`[Memory Manager] Loaded memory for session ${this.sessionId}:`, memory.blocks.length, "blocks");
		return memory;
	}

	/**
	 * Get a specific block by label
	 */
	getBlock(label: string): MemoryBlock | undefined {
		if (!this.memoryCache) {
			this.load();
		}
		return this.memoryCache?.find((b) => b.label === label);
	}

	/**
	 * Get all blocks
	 */
	getBlocks(): MemoryBlock[] {
		if (!this.memoryCache) {
			this.load();
		}
		return this.memoryCache || [];
	}

	/**
	 * List all block labels
	 */
	listBlockLabels(): string[] {
		return this.getBlocks().map((b) => b.label);
	}

	/**
	 * Create a new block
	 */
	createBlock(block: CreateMemoryBlock): MemoryBlock {
		// Check for duplicate label
		if (this.getBlock(block.label)) {
			throw new Error(`Block with label "${block.label}" already exists`);
		}

		// Validate value length against charLimit
		const value = block.value || "";
		const charLimit = block.charLimit || 4000;
		if (value.length > charLimit) {
			throw new Error(`Value length (${value.length}) exceeds charLimit (${charLimit}) for block "${block.label}"`);
		}

		const newBlock = this.db.createBlock(this.sessionId, block);
		this.cacheUpdate(newBlock);
		return newBlock;
	}

	/**
	 * Update a block
	 */
	updateBlock(label: string, updates: Partial<UpdateMemoryBlock>): MemoryBlock | undefined {
		const existing = this.getBlock(label);
		if (!existing) {
			return undefined;
		}

		// Check read-only
		if (existing.readOnly) {
			throw new Error(`Block "${label}" is read-only and cannot be modified`);
		}

		// Validate value length
		if (updates.value !== undefined && updates.charLimit !== undefined && updates.value.length > updates.charLimit) {
			throw new Error(
				`Value length (${updates.value.length}) exceeds charLimit (${updates.charLimit}) for block "${label}"`,
			);
		} else if (updates.value !== undefined && updates.value.length > existing.charLimit) {
			throw new Error(
				`Value length (${updates.value.length}) exceeds charLimit (${existing.charLimit}) for block "${label}"`,
			);
		}

		const updatedBlock = this.db.updateBlock(this.sessionId, label, updates);
		if (updatedBlock) {
			this.cacheUpdate(updatedBlock);
		}
		return updatedBlock;
	}

	/**
	 * Delete a block
	 */
	deleteBlock(label: string): boolean {
		const block = this.getBlock(label);
		if (!block) {
			return false;
		}

		if (block.readOnly) {
			throw new Error(`Block "${label}" is read-only and cannot be deleted`);
		}

		const success = this.db.deleteBlock(this.sessionId, label);
		if (success && this.memoryCache) {
			this.memoryCache = this.memoryCache.filter((b) => b.label !== label);
		}
		return success;
	}

	/**
	 * Append content to a block
	 */
	appendBlock(label: string, content: string): MemoryBlock | undefined {
		const block = this.getBlock(label);
		if (!block) {
			return undefined;
		}

		if (block.readOnly) {
			throw new Error(`Block "${label}" is read-only and cannot be modified`);
		}

		console.log(
			`[Memory Manager] Appending to block ${label}:`,
			content.substring(0, 50) + (content.length > 50 ? "..." : ""),
		);
		const newValue = block.value + (block.value ? "\n" : "") + content;
		return this.updateBlock(label, { value: newValue });
	}

	/**
	 * Replace content in a block
	 */
	replaceBlock(label: string, oldContent: string, newContent: string): MemoryBlock | undefined {
		const block = this.getBlock(label);
		if (!block) {
			return undefined;
		}

		if (block.readOnly) {
			throw new Error(`Block "${label}" is read-only and cannot be modified`);
		}

		if (oldContent && !block.value.includes(oldContent)) {
			throw new Error(`Old content not found in block "${label}"`);
		}

		let newValue = block.value;
		if (oldContent) {
			newValue = block.value.replace(oldContent, newContent);
		} else {
			newValue = newContent;
		}

		return this.updateBlock(label, { value: newValue });
	}

	/**
	 * Get block history
	 */
	getBlockHistory(label: string) {
		return this.db.getBlockHistory(this.sessionId, label);
	}

	/**
	 * Compile memory blocks into a prompt string
	 */
	compile(options?: Parameters<typeof compileMemory>[1]): string {
		return compileMemory(this.getBlocks(), options);
	}

	/**
	 * Update cache with new or updated block
	 */
	private cacheUpdate(block: MemoryBlock): void {
		if (!this.memoryCache) return;

		const index = this.memoryCache.findIndex((b) => b.id === block.id);
		if (index >= 0) {
			this.memoryCache[index] = block;
		} else {
			this.memoryCache.push(block);
		}
	}

	/**
	 * Clear cache
	 */
	clearCache(): void {
		this.memoryCache = null;
	}

	/**
	 * Close database connection
	 */
	close(): void {
		this.db.close();
	}
}
