/**
 * Memory Tools - Agent-accessible tools for memory management
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import type { MemoryManager } from "./manager.js";

// Schema definitions
const memoryListSchema = Type.Object({});

const memoryAppendSchema = Type.Object({
	label: Type.String({
		description: "The label of the memory block to append to (e.g., 'persona', 'project', 'tasks')",
	}),
	content: Type.String({
		description: "The content to append to the memory block. Will be added on a new line.",
	}),
});

const memoryReplaceSchema = Type.Object({
	label: Type.String({
		description: "The label of the memory block to edit (e.g., 'persona', 'project', 'tasks')",
	}),
	old_content: Type.Optional(
		Type.String({
			description:
				"The exact text to replace. Must match exactly. If empty or omitted, replaces the entire block value with new_content.",
		}),
	),
	new_content: Type.String({
		description: "The new content to write. If empty string, the old_content will be deleted.",
	}),
});

/**
 * Create memory tools for agent use
 */
export function createMemoryTools(memoryManager: MemoryManager): AgentTool<any>[] {
	return [
		createMemoryListTool(memoryManager),
		createMemoryAppendTool(memoryManager),
		createMemoryReplaceTool(memoryManager),
	];
}

/**
 * Tool: List all memory blocks
 */
function createMemoryListTool(memoryManager: MemoryManager): AgentTool<typeof memoryListSchema> {
	return {
		name: "memory_list",
		description:
			"List all available memory blocks with their current content size and limits. Returns a summary of each block including label, description, current character count, and limit.",
		parameters: memoryListSchema,
		label: "List Memory",
		execute: async (_toolCallId, _params, _signal) => {
			const blocks = memoryManager.getBlocks();

			const summary = blocks
				.map((b) => {
					const parts = [`${b.label}:`];
					if (b.description) {
						parts.push(b.description);
					}
					parts.push(`(${b.value.length}/${b.charLimit} chars)`);
					if (b.readOnly) {
						parts.push("[read-only]");
					}
					return parts.join(" ");
				})
				.join("\n");

			return {
				content: [
					{
						type: "text",
						text: summary || "No memory blocks available.",
					},
				],
				details: {
					blocks: blocks.map((b) => ({
						label: b.label,
						description: b.description,
						current: b.value.length,
						limit: b.charLimit,
					})),
				},
			};
		},
	};
}

/**
 * Tool: Append content to a memory block
 */
function createMemoryAppendTool(memoryManager: MemoryManager): AgentTool<typeof memoryAppendSchema> {
	return {
		name: "memory_append",
		description:
			"Append content to a memory block. Creates a new line at the end of the block with the provided content. Use this to add new information to memory.",
		parameters: memoryAppendSchema,
		label: "Append to Memory",
		execute: async (_toolCallId, { label, content }: { label: string; content: string }, _signal) => {
			try {
				const block = memoryManager.appendBlock(label, content);

				if (!block) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Memory block '${label}' not found. Use memory_list to see available blocks.`,
							},
						],
						details: { error: "Block not found" },
					};
				}

				return {
					content: [
						{
							type: "text",
							text: `Successfully appended to '${label}'. Block now contains ${block.value.length}/${block.charLimit} characters.`,
						},
					],
					details: { label, newLength: block.value.length, limit: block.charLimit },
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error appending to memory: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					details: { error: error instanceof Error ? error.message : String(error) },
				};
			}
		},
	};
}

/**
 * Tool: Replace content in a memory block
 */
function createMemoryReplaceTool(memoryManager: MemoryManager): AgentTool<typeof memoryReplaceSchema> {
	return {
		name: "memory_replace",
		description:
			"Replace content in a memory block. Use this to update or delete information. To delete content, use an empty string for new_content.",
		parameters: memoryReplaceSchema,
		label: "Replace in Memory",
		execute: async (
			_toolCallId,
			{ label, old_content, new_content }: { label: string; old_content?: string; new_content: string },
			_signal,
		) => {
			try {
				const block = memoryManager.replaceBlock(label, old_content || "", new_content);

				if (!block) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Memory block '${label}' not found. Use memory_list to see available blocks.`,
							},
						],
						details: { error: "Block not found" },
					};
				}

				return {
					content: [
						{
							type: "text",
							text: `Successfully updated '${label}'. Block now contains ${block.value.length}/${block.charLimit} characters.`,
						},
					],
					details: { label, newLength: block.value.length, limit: block.charLimit },
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error updating memory: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					details: { error: error instanceof Error ? error.message : String(error) },
				};
			}
		},
	};
}
