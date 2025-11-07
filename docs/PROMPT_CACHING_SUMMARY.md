# Prompt Caching Implementation Summary

## Quick Overview

The Cline project implements Anthropic's Prompt Caching feature to significantly reduce API costs and latency for Claude model interactions. Here's what you need to know:

### What Gets Cached?

1. **System Prompt** (Always cached)
   - The large instruction set that defines Cline's behavior
   - Cached on every request to maximize savings
   - Typically ~50,000+ tokens

2. **Last Two User Messages** (Rolling cache)
   - Maintains conversation context efficiently
   - Creates a "rolling cache" that builds up over time
   - Allows the API to understand conversation flow

### How It Works

```
Request 1:
├─ System Prompt [marked for caching] → Creates cache
└─ User Message [marked for caching] → Creates cache

Request 2:
├─ System Prompt [retrieved from cache] ✓
├─ User Message 1 [retrieved from cache] ✓
└─ User Message 2 [marked for caching] → Creates cache

Request 3:
├─ System Prompt [retrieved from cache] ✓
├─ User Message 1 [expired/not cached]
├─ User Message 2 [retrieved from cache] ✓
└─ User Message 3 [marked for caching] → Creates cache
```

### Cost Savings Example

For Claude 3.5 Sonnet (typical multi-turn conversation):

**Without Caching:**
- Input: 52,000 tokens × $3.00/million = $0.156
- Output: 1,000 tokens × $15.00/million = $0.015
- **Total: $0.171**

**With Caching:**
- New input: 2,000 tokens × $3.00/million = $0.006
- Cached input: 50,000 tokens × $0.30/million = $0.015
- Output: 1,000 tokens × $15.00/million = $0.015
- **Total: $0.036**

**Savings: ~79% reduction!**

## Key Implementation Files

1. **`src/core/api/providers/anthropic.ts`**
   - Main provider implementation
   - Adds `cache_control: { type: "ephemeral" }` markers
   - Handles streaming responses with cache statistics

2. **`src/core/api/transform/anthropic-format.ts`**
   - Message sanitization and transformation
   - Adds cache control markers to specific messages
   - Removes reasoning details before sending to API

3. **`src/utils/cost.ts`**
   - Cost calculation with cache pricing
   - Separate rates for cache reads/writes
   - Supports multiple pricing models

## Important Details

### Supported Models

Caching only works with specific Claude models:
- ✓ Claude 3.5 Sonnet (all versions)
- ✓ Claude 3.5 Haiku
- ✓ Claude Opus 4
- ✓ Claude 3 Opus
- ✓ Claude 3 Haiku
- ✗ 'latest' model alias (doesn't support cache_control)

### Cache Behavior

- **Duration**: 5 minutes of inactivity
- **Type**: Ephemeral (temporary, not permanent)
- **Minimum Size**: ~1024 tokens (mentioned in comment about Haiku)
- **Placement**: Must be at the end of content sections

### Why Last Two User Messages?

The implementation caches the last two user messages to:
1. **Current request**: Retrieve the second-to-last user message from cache
2. **Next request**: Current user message becomes the cached one
3. **Continuity**: Maintains conversation flow without re-processing

This creates an efficient "rolling window" of cached context.

## Testing

Tests are provided in:
- **`src/core/api/transform/__tests__/anthropic-format.test.ts`**
  - Tests message sanitization
  - Validates cache control marker placement
  - Tests reasoning details removal
  - Edge case handling

- **`src/utils/cost.test.ts`**
  - Validates cost calculations with caching
  - Tests different pricing models
  - Verifies cache read/write cost accounting

## Integration with Other Providers

The same caching strategy is also implemented for:
- **OpenRouter**: Uses Anthropic-compatible API
- **Vercel AI Gateway**: Similar implementation
- **LiteLLM**: Optional caching via configuration
- **AWS Bedrock**: Different caching mechanism (uses `cachePoint` instead)

## Best Practices from the Code

1. **Always cache system prompts** - They're large and static
2. **Use rolling cache for messages** - Maintains context efficiently
3. **Place markers at content boundaries** - Last block in multi-part content
4. **Remove reasoning details** - Don't send internal metadata to API
5. **Monitor cache hit rates** - Track usage statistics for optimization

## Limitations

1. **5-minute timeout**: Cache expires quickly, may be too short for some workflows
2. **Model-specific**: Not all Claude models support caching
3. **Network dependency**: Requires active conversation within timeout window
4. **Minimum size requirements**: Small prompts may not benefit from caching

## Documentation

Full detailed documentation available in:
- **`docs/PROMPT_CACHING_IMPLEMENTATION.md`**

This includes:
- Complete code walkthroughs
- Cache lifecycle diagrams
- Performance analysis
- Future enhancement ideas
- References to Anthropic's documentation

## Summary

The prompt caching implementation in Cline is production-ready and well-designed, featuring:
- ✓ Automatic caching for maximum cost savings
- ✓ Rolling cache strategy for conversation context
- ✓ Proper handling of cache control markers
- ✓ Accurate cost tracking
- ✓ Multi-provider support
- ✓ Comprehensive testing

The implementation demonstrates best practices and can serve as a reference for anyone implementing Anthropic's prompt caching feature.
