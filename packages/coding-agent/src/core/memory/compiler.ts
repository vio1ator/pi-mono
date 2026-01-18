/**
 * Memory Compiler - Format memory blocks for prompt injection
 */

import type { CompiledMemoryBlock, MemoryBlock, MemoryCompileOptions } from "./schema.js";

/**
 * Core memory line number warning for specific agent types
 */
const CORE_MEMORY_LINE_NUMBER_WARNING =
	"IMPORTANT: The <value> field below contains a line-numbered memory block. When editing this block, you must preserve all line numbers exactly as they appear. Do not remove, renumber, or modify the line number prefixes (e.g., '1→ ', '2→ ', '3→ '). Only modify the content after the arrow and space.";

/**
 * Compile memory blocks into a prompt string
 * Based on Letta's memory compilation system
 */
export function compileMemory(blocks: MemoryBlock[], options?: MemoryCompileOptions): string {
	if (blocks.length === 0) {
		return "";
	}

	const s: string[] = [];
	const useLineNumbers = shouldUseLineNumbers(options);

	s.push("<memory_blocks>");
	s.push("The following memory blocks are currently engaged in your core memory unit:\n");

	for (let idx = 0; idx < blocks.length; idx++) {
		const block = blocks[idx];

		// Skip hidden blocks
		if (block.hidden) {
			continue;
		}

		s.push(`<${block.label}>`);
		s.push("<description>");
		s.push(block.description || "");
		s.push("</description>");
		s.push("<metadata>");

		if (block.readOnly) {
			s.push("- read_only=true");
		}

		s.push(`- chars_current=${block.value.length}`);
		s.push(`- chars_limit=${block.charLimit}`);
		s.push("</metadata>");

		if (useLineNumbers) {
			s.push(`<warning>\n${CORE_MEMORY_LINE_NUMBER_WARNING}\n</warning>`);
		}

		s.push("<value>");
		if (useLineNumbers) {
			s.push(...renderWithLineNumbers(block.value));
		} else {
			s.push(block.value);
		}
		s.push("</value>");
		s.push(`</${block.label}>`);

		if (idx < blocks.length - 1) {
			s.push("");
		}
	}

	s.push("</memory_blocks>");

	return s.join("\n");
}

/**
 * Determine whether to use line numbers based on options
 * Mimics Letta's logic for specific agent types and models
 */
function shouldUseLineNumbers(options?: MemoryCompileOptions): boolean {
	if (!options || !options.llmConfig) {
		return false;
	}

	const { modelEndpointType } = options.llmConfig;

	// Only use line numbers for Anthropic models
	if (modelEndpointType !== "anthropic") {
		return false;
	}

	// Line numbers used for specific agent types in Letta
	// For pi, we'll enable line numbers for all Anthropic models by default
	// This can be configured via options if needed
	return true;
}

/**
 * Render text with line numbers
 */
function renderWithLineNumbers(text: string): string[] {
	if (!text) {
		return [];
	}

	const lines = text.split("\n");
	const result: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		result.push(`${i + 1}→ ${lines[i]}`);
	}

	return result;
}

/**
 * Get compiled memory blocks as structured objects
 * Useful for debugging and UI display
 */
export function getCompiledMemoryBlocks(blocks: MemoryBlock[]): CompiledMemoryBlock[] {
	return blocks
		.filter((b) => !b.hidden)
		.map((block) => ({
			label: block.label,
			description: block.description || "",
			metadata: {
				charsCurrent: block.value.length,
				charsLimit: block.charLimit,
				readOnly: block.readOnly,
			},
			value: block.value,
		}));
}

/**
 * Estimate tokens in compiled memory
 * Rough estimation: ~4 chars per token
 */
export function estimateCompiledMemoryTokens(blocks: MemoryBlock[]): number {
	const compiled = compileMemory(blocks);
	return Math.ceil(compiled.length / 4);
}
