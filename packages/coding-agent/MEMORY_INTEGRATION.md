# Persistent Memory Integration for Pi Coding Agent

This document describes the integration of Letta's persistent memory system into the pi coding agent, enabling agents to maintain structured memory blocks across sessions.

## What Was Implemented

### Core Memory System
- **Memory Blocks**: Labeled, persistent memory sections (e.g., `persona`, `project`, `tasks`)
- **Character Limits**: Each block has configurable character limits
- **Read-Only Protection**: Some blocks can be marked read-only (like `persona`)
- **Edit Tracking**: Version history for all memory block changes

### Storage Layer
- **SQLite Database**: Persistent storage at `~/.pi/agent/memory.db`
- **Tables**:
  - `memory_blocks`: Block data with labels, values, limits
  - `memory_block_history`: Version history for tracking changes
- **Global-Persisted**: Memory blocks are shared across all sessions for the same user/agent

### Memory Tools
Agents can manage their memory using these tools:
- `memory_list()` - List all available memory blocks
- `memory_append(label, content)` - Append to a memory block
- `memory_replace(label, old_content, new_content)` - Replace content

### System Prompt Integration
Memory blocks are automatically compiled and injected into the system prompt before each LLM call:
```
<memory_blocks>
The following memory blocks are currently engaged in your core memory unit:

<persona>
<description>Your role and capabilities</description>
<metadata>- read_only=true
- chars_current=145
- chars_limit=2000</metadata>
<value>
You are an AI coding assistant with expertise in software development.
</value>
</persona>

<project>
<description>Information about current project</description>
<metadata>- chars_current=0
- chars_limit=4000</metadata>
<value>
</value>
</project>

<tasks>
<description>Tasks and action items for project</description>
<metadata>- chars_current=0
- chars_limit=4000</metadata>
<value>
</value>
</tasks>
</memory_blocks>
```

## Configuration

Memory can be configured in `~/.pi/agent/settings.json`:

```json
{
  "memory": {
    "enabled": true,
    "defaultBlocks": [
      {
        "label": "persona",
        "value": "You are an AI coding assistant with expertise in software development.",
        "description": "Your role and capabilities",
        "limit": 2000,
        "readOnly": true
      },
      {
        "label": "project",
        "value": "",
        "description": "Information about current project",
        "limit": 4000
      },
      {
        "label": "tasks",
        "value": "",
        "description": "Tasks and action items for project",
        "limit": 4000
      }
    ],
    "maxBlocks": 10
  }
}
```

### Configuration Options
- `enabled` (boolean): Enable/disable memory system (default: true)
- `defaultBlocks` (array): Default blocks to create for new sessions
- `maxBlocks` (number): Maximum number of memory blocks per session (default: 10)

### Per-Block Options
- `label` (string): Unique identifier for the block
- `value` (string): Initial content of the block
- `description` (string): Description shown in the prompt
- `limit` (number): Character limit for the block
- `readOnly` (boolean): Whether the block can be modified by tools
- `hidden` (boolean): Whether the block should be excluded from the prompt
- `metadata` (object): Arbitrary metadata attached to the block

## Usage Examples

### Basic Usage
Memory is automatically enabled and initialized when you start a session. The agent can use memory tools to update its memory:

```
You: Please remember that this is a TypeScript project using Next.js
Agent: [uses memory_append] Added to 'project' block
```

The agent will now have this information available in every subsequent interaction, without needing to re-explain the project.

### Memory-Aware Context
When the agent receives a prompt, memory is compiled and injected before the system prompt. This means:
- Critical project details are always in context
- No need to scroll through old messages to find key information
- Memory is separate from chat history, so it's preserved during compaction

### Custom Memory Blocks
You can add custom memory blocks to your settings:

```json
{
  "memory": {
    "defaultBlocks": [
      {
        "label": "persona",
        "value": "You are an expert in Rust and embedded systems.",
        "description": "Your specialization",
        "limit": 2000,
        "readOnly": true
      },
      {
        "label": "hardware",
        "value": "",
        "description": "Hardware platform details",
        "limit": 3000
      },
      {
        "label": "conventions",
        "value": "",
        "description": "Coding conventions and patterns",
        "limit": 5000
      }
    ]
  }
}
```

### Session Persistence
Memory is session-scoped. When you:
- Switch sessions: Memory automatically loads for the new session
- Create new session: Default memory blocks are created
- Delete session: Memory is automatically deleted

## Architecture

### Files Created
- `src/core/memory/schema.ts` - TypeScript interfaces
- `src/core/memory/database.ts` - SQLite database operations
- `src/core/memory/manager.ts` - High-level memory API
- `src/core/memory/compiler.ts` - Memory to prompt compilation
- `src/core/memory/tools.ts` - Memory management tools
- `src/core/memory/index.ts` - Module exports

### Files Modified
- `src/core/agent-session.ts` - Added memory manager, initialization, and prompt integration
- `src/core/sdk.ts` - Created memory manager and passed to AgentSession
- `src/core/settings-manager.ts` - Added memory configuration methods
- `src/config.ts` - Added `getMemoryDbPath()` function
- `package.json` - Added `better-sqlite3` and `@types/better-sqlite3` dependencies

### Integration Points
1. **SettingsManager**: Provides memory configuration
2. **SDK**: Creates MemoryManager instance
3. **AgentSession**:
   - Initializes memory on session start
   - Registers memory tools
   - Injects compiled memory into system prompt
4. **Agent Loop**: Memory is automatically included in every LLM call

## Future Enhancements

### Memory-Aware Compaction
When compaction occurs, memory blocks should be:
- Preserved in full (not summarized)
- Potentially updated with insights from summarized chat
- Used to guide the summarization process

### Memory Search
Add `memory_search()` tool for semantic search across memory blocks:
- Embedding-based search
- Return relevant blocks with scores
- Allow agent to "recall" specific information

### Memory Categories
- Organize blocks into categories (user_info, project_state, preferences, etc.)
- Category-based limits and rules
- Selective injection based on context

### Multi-Session Memory
- Shared memory blocks across sessions in same project
- Global vs session-scoped memory
- Memory inheritance and templates

## Testing

### Manual Testing
1. Start a new session: `pi`
2. Check memory initialization: The agent should have default blocks
3. Ask the agent to remember something: "Remember that we're using TypeScript"
4. Verify memory was updated: Check `~/.pi/agent/memory.db` or ask agent to list memory
5. Start a new session: Memory should persist from previous session
6. Disable memory in settings: `{"memory": {"enabled": false}}`
7. Restart session: Memory tools should not be available

### Unit Testing
```typescript
import { MemoryManager } from "./memory/index.js";
import { randomUUID } from "crypto";

const manager = new MemoryManager("test.db", randomUUID());

// Create default blocks
const block = manager.createBlock({
  label: "test",
  value: "initial content",
  limit: 1000,
});

// Update block
manager.appendBlock("test", "new content");

// Compile for prompt
const prompt = manager.compile();
console.log(prompt);
```

## Troubleshooting

### Memory Not Working
1. Check settings: `~/.pi/agent/settings.json` has `"memory": {"enabled": true}`
2. Check database: `~/.pi/agent/memory.db` should exist
3. Check logs: Memory initialization errors appear in debug log
4. Verify tools: `/tools` should show `memory_list`, `memory_append`, `memory_replace`

### Database Errors
- Ensure `better-sqlite3` is installed: `npm install`
- Check file permissions on `~/.pi/agent/memory.db`
- Try deleting the database file to start fresh

### Memory Not Injected
1. Check that memory manager is being created in `sdk.ts`
2. Verify `_initializeMemory()` is being called in `AgentSession`
3. Check system prompt: The agent's system prompt should include `<memory_blocks>`

## License
MIT - Part of the pi-mono project
