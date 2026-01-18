/**
 * Memory Schema - TypeScript interfaces for persistent memory blocks
 *
 * Based on Letta's memory system architecture
 */

/**
 * A single memory block with labeled content
 */
export interface MemoryBlock {
	id: string;
	label: string;
	value: string;
	description?: string;
	charLimit: number;
	readOnly: boolean;
	hidden?: boolean;
	createdAt: string;
	updatedAt: string;
	version: number;
	metadata?: Record<string, unknown>;
}

/**
 * Create options for new memory blocks
 */
export interface CreateMemoryBlock {
	label: string;
	value?: string;
	description?: string;
	charLimit?: number;
	readOnly?: boolean;
	hidden?: boolean;
	metadata?: Record<string, unknown>;
}

/**
 * Update options for existing memory blocks
 */
export interface UpdateMemoryBlock {
	value?: string;
	description?: string;
	charLimit?: number;
	readOnly?: boolean;
	hidden?: boolean;
	metadata?: Record<string, unknown>;
}

/**
 * Memory block version history
 */
export interface MemoryBlockHistory {
	id: string;
	blockId: string;
	label: string;
	value: string;
	version: number;
	createdAt: string;
	createdAtBy: string; // "agent" or "user"
}

/**
 * Memory state for a session
 */
export interface SessionMemory {
	blocks: MemoryBlock[];
	createdAt: string;
	updatedAt: string;
}

/**
 * Memory configuration from settings
 */
export interface MemoryConfig {
	enabled: boolean;
	defaultBlocks: CreateMemoryBlock[];
	maxBlocks: number;
	databasePath?: string;
}

/**
 * Memory compilation options
 */
export interface MemoryCompileOptions {
	toolUsageRules?: { description?: string; value?: string };
	sources?: Array<{ name: string; description?: string; instructions?: string; id: string }>;
	maxFilesOpen?: number;
	llmConfig?: { modelEndpointType?: string };
}

/**
 * Memory block metadata for prompt rendering
 */
export interface MemoryBlockMetadata {
	charsCurrent: number;
	charsLimit: number;
	readOnly: boolean;
}

/**
 * Compiled memory block for prompt
 */
export interface CompiledMemoryBlock {
	label: string;
	description: string;
	metadata: MemoryBlockMetadata;
	value: string;
}
