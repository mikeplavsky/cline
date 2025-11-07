# Prompt Caching Implementation for Anthropic Large Language Models

## Overview

This document explains how prompt caching is implemented in the Cline project for Anthropic's Claude models. Prompt caching is a feature that allows reusing previously processed content across API requests, significantly reducing costs and latency for repeated content.

## Background: What is Prompt Caching?

Anthropic's Prompt Caching feature allows you to cache portions of the prompt that are reused across multiple API calls. This is particularly valuable for:
- **System prompts** that remain constant across conversations
- **Conversation history** that builds up over time
- **Large context documents** that are referenced repeatedly

### Benefits:
- **Cost reduction**: Cached tokens cost ~90% less than regular input tokens (e.g., $0.30 vs $3.00 per million tokens for Claude 3.5 Sonnet)
- **Latency reduction**: Cached content is retrieved faster than processing new tokens
- **Efficiency**: Particularly valuable for long conversations with large system prompts

## Implementation Architecture

The prompt caching implementation in Cline consists of three main components:

### 1. Provider Layer (`src/core/api/providers/anthropic.ts`)

The `AnthropicHandler` class is responsible for:
- Creating API requests with appropriate cache control markers
- Managing model-specific caching behavior
- Handling streaming responses with cache usage statistics

### 2. Message Transformation Layer (`src/core/api/transform/anthropic-format.ts`)

The `sanitizeAnthropicMessages` function handles:
- Adding `cache_control` markers to appropriate message content
- Removing reasoning details from messages before sending to API
- Converting string content to structured content blocks with cache markers

### 3. Cost Calculation Layer (`src/utils/cost.ts`)

The cost utilities track:
- Cache creation (write) tokens
- Cache read tokens
- Regular input/output tokens
- Different pricing for each token type

## Detailed Implementation

### Cache Control Strategy

The implementation uses Anthropic's "ephemeral" cache type, which stores cached content temporarily (currently 5 minutes). The caching strategy follows this pattern:

```typescript
// From anthropic.ts lines 99-105
system: [
    {
        text: systemPrompt,
        type: "text",
        cache_control: { type: "ephemeral" },
    },
]
```

#### System Prompt Caching

**What**: The system prompt is always marked with `cache_control: { type: "ephemeral" }`

**Why**: System prompts are large and remain constant across requests in a task, making them ideal candidates for caching

**Implementation**: Applied directly in the API request structure (line 103 in `anthropic.ts`)

#### Message History Caching

**Strategy**: Cache the last two user messages to maintain conversation context

**Implementation** (from `anthropic.ts` lines 78-89):

```typescript
// Find the indices of the last two user messages
const userMsgIndices = messages.reduce((acc, msg, index) => {
    if (msg.role === "user") {
        acc.push(index)
    }
    return acc
}, [] as number[])
const lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1
const secondLastMsgUserIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1

const anthropicMessages = sanitizeAnthropicMessages(messages, lastUserMsgIndex, secondLastMsgUserIndex)
```

**Why this approach?**

From the code comment (lines 77-79):
> "The latest message will be the new user message, one before will be the assistant message from a previous request, and the user message before that will be a previously cached user message. So we need to mark the latest user message as ephemeral to cache it for the next request, and mark the second to last user message as ephemeral to let the server know the last message to retrieve from the cache for the current request."

This creates a "rolling cache" where:
1. **Current request**: The second-to-last user message is retrieved from cache (if available)
2. **Next request**: The current user message will be retrieved from cache
3. This pattern continues, building up conversation context efficiently

### Message Sanitization

The `sanitizeAnthropicMessages` function in `anthropic-format.ts` performs two key operations:

#### 1. Remove Reasoning Details

```typescript
function removeReasoningDetails(param: MessageParam): MessageParam {
    if (Array.isArray(param.content)) {
        return {
            ...param,
            content: param.content.map((item) => {
                if (item.type === "text") {
                    return {
                        ...item,
                        reasoning_details: undefined,
                    }
                }
                return item
            }),
        }
    }
    return param
}
```

This removes internal reasoning metadata that shouldn't be sent back to the API.

#### 2. Add Cache Control Markers

```typescript
if (addCacheControl && (index === lastUserMsgIndex || index === secondLastMsgUserIndex)) {
    return {
        ...message,
        content:
            typeof message.content === "string"
                ? [
                      {
                          type: "text",
                          text: message.content,
                          cache_control: {
                              type: "ephemeral",
                          },
                      },
                  ]
                : message.content.map((content, contentIndex) =>
                      contentIndex === message.content.length - 1
                          ? {
                                ...content,
                                cache_control: {
                                    type: "ephemeral",
                                },
                            }
                          : content,
                  ),
    }
}
```

Key points:
- String content is converted to structured format with cache control
- For array content, only the **last content block** gets the cache marker
- This follows Anthropic's requirement that cache breakpoints must be at the end of a logical content section

### Cache Usage Tracking

Cache statistics are received in the streaming response:

```typescript
case "message_start":
    const usage = chunk.message.usage
    yield {
        type: "usage",
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        cacheWriteTokens: usage.cache_creation_input_tokens || undefined,
        cacheReadTokens: usage.cache_read_input_tokens || undefined,
    }
    break
```

These statistics are used for:
1. **Cost calculation** - Different pricing for cache reads/writes
2. **User feedback** - Showing how much caching is saving
3. **Debugging** - Understanding cache hit/miss patterns

### Cost Calculation

The `calculateApiCostAnthropic` function in `cost.ts` handles the different pricing tiers:

```typescript
export function calculateApiCostAnthropic(
    modelInfo: ModelInfo,
    inputTokens: number,
    outputTokens: number,
    cacheCreationInputTokens?: number,
    cacheReadInputTokens?: number,
    thinkingBudgetTokens?: number,
): number {
    const cacheCreationInputTokensNum = cacheCreationInputTokens || 0
    const cacheReadInputTokensNum = cacheReadInputTokens || 0
    
    return calculateApiCostInternal(
        modelInfo,
        inputTokens,
        outputTokens,
        cacheCreationInputTokensNum,
        cacheReadInputTokensNum,
        inputTokens + cacheCreationInputTokensNum + cacheReadInputTokensNum,
        thinkingBudgetTokens,
    )
}
```

The internal calculation applies different rates:
- **Base input tokens**: `modelInfo.inputPrice` (e.g., $3.00 per million)
- **Cache write tokens**: `modelInfo.cacheWritesPrice` (e.g., $3.75 per million)
- **Cache read tokens**: `modelInfo.cacheReadsPrice` (e.g., $0.30 per million)
- **Output tokens**: `modelInfo.outputPrice` (e.g., $15.00 per million)

### Model Support

Caching is only enabled for specific Claude models (from `anthropic.ts` lines 64-76):

```typescript
switch (modelId) {
    case "claude-haiku-4-5-20251001":
    case "claude-sonnet-4-5-20250929:1m":
    case "claude-sonnet-4-5-20250929":
    case "claude-sonnet-4-20250514":
    case "claude-3-7-sonnet-20250219":
    case "claude-3-5-sonnet-20241022":
    case "claude-3-5-haiku-20241022":
    case "claude-opus-4-20250514":
    case "claude-opus-4-1-20250805":
    case "claude-3-opus-20240229":
    case "claude-3-haiku-20240307": {
        // Caching enabled
        ...
    }
    default: {
        // No caching for older/unsupported models
        ...
    }
}
```

Note from line 65: `'latest' alias does not support cache_control`

## Cache Lifecycle

### Request Flow

1. **First Request**:
   - System prompt marked with `cache_control`
   - User message marked with `cache_control`
   - API processes all content, creates cache
   - Response includes `cache_creation_input_tokens`

2. **Second Request**:
   - System prompt retrieved from cache (cache hit)
   - Previous user message retrieved from cache (cache hit)
   - New user message marked with `cache_control`
   - Assistant's previous response included as message
   - Response includes `cache_read_input_tokens`

3. **Subsequent Requests**:
   - Pattern continues with rolling cache of last two user messages
   - System prompt always retrieved from cache (if within 5-minute window)

### Cache Expiration

- Ephemeral caches expire after **5 minutes** of inactivity
- Each cache hit resets the 5-minute timer
- If cache expires, next request creates new cache (incurring write costs again)

## Integration with Other Providers

The caching pattern is also implemented for other providers that support Anthropic-compatible APIs:

### OpenRouter (`src/core/api/transform/openrouter-stream.ts`)

```typescript
// Add cache_control to system prompt
cache_control: { type: "ephemeral" }

// Add cache_control to the last two user messages
lastTextPart["cache_control"] = { type: "ephemeral" }
```

### Vercel AI Gateway (`src/core/api/transform/vercel-ai-gateway-stream.ts`)

Similar implementation with cache control for system prompt and last two user messages.

### LiteLLM (`src/core/api/providers/litellm.ts`)

```typescript
const cacheControl = this.options.ocaUsePromptCache 
    ? { cache_control: { type: "ephemeral" } } 
    : undefined
```

Conditionally applies caching based on configuration.

### Bedrock & SAP AI Core

Note from `bedrock.ts`:
> "AWS Bedrock uses cachePoint objects instead of Anthropic's cache_control approach"

These providers have their own caching mechanisms that differ from Anthropic's standard approach.

## Best Practices

Based on the implementation, here are the key best practices:

### 1. Cache Placement
- Place cache breakpoints at the **end** of content sections
- For multi-part content, only mark the **last part** with cache_control
- Cache large, static content (like system prompts) first

### 2. Message Structure
- Convert string content to structured format for caching
- Maintain proper message ordering (user/assistant alternation)
- Remove reasoning details before caching

### 3. Cost Optimization
- System prompts are always cached (largest cost saving)
- Last two user messages cached for conversation context
- Balance between cache writes and reads based on conversation patterns

### 4. Model Selection
- Use supported models only (check the switch statement)
- Avoid 'latest' alias as it doesn't support caching
- Consider cache pricing in model selection

## Testing

The implementation includes comprehensive tests in `src/utils/cost.test.ts`:

```typescript
it("should use real model configuration (Claude 3.5 Sonnet)", () => {
    const modelInfo: ModelInfo = {
        maxTokens: 8192,
        contextWindow: 200_000,
        supportsImages: true,
        supportsPromptCache: true,
        inputPrice: 3.0,
        outputPrice: 15.0,
        cacheWritesPrice: 3.75,
        cacheReadsPrice: 0.3,
    }

    const cost = calculateApiCostAnthropic(modelInfo, 2000, 1000, 1500, 500)
    // Cache writes: (3.75 / 1_000_000) * 1500 = 0.005625
    // Cache reads: (0.3 / 1_000_000) * 500 = 0.00015
    // Input: (3.0 / 1_000_000) * 2000 = 0.006
    // Output: (15.0 / 1_000_000) * 1000 = 0.015
    // Total: 0.005625 + 0.00015 + 0.006 + 0.015 = 0.026775
    cost.should.equal(0.026775)
})
```

Tests verify:
- Correct cost calculation for cache reads/writes
- Handling of zero token counts
- Different pricing models (Anthropic vs OpenAI-style)
- Edge cases and missing prices

## Performance Considerations

### Cache Hit Rate
- System prompts: Very high hit rate (same across all requests in a task)
- User messages: High hit rate for consecutive requests within 5 minutes
- Overall: Significant cost savings for multi-turn conversations

### Token Distribution Example
For a typical conversation after initial setup:
- **Input tokens**: 2,000 (new conversation context)
- **Cache read tokens**: 50,000 (system prompt + previous messages)
- **Output tokens**: 1,000

Cost comparison:
- **Without caching**: (52,000 × $3.00 + 1,000 × $15.00) / 1M = $0.171
- **With caching**: (2,000 × $3.00 + 50,000 × $0.30 + 1,000 × $15.00) / 1M = $0.036

**Savings**: ~79% reduction in API costs!

## Limitations and Considerations

1. **Cache Duration**: 5-minute window may be too short for some workflows
2. **Model Support**: Not all Claude models support caching
3. **Minimum Size**: Anthropic has minimum token requirements for caching (typically 1024 tokens)
4. **Cache Fragmentation**: Each unique cached content section counts separately
5. **Tool Use Compatibility**: Code mentions tools could be cached but are not (line 107 comment)

## Future Enhancements

Potential improvements noted in the code:

1. **Tool Caching**: Currently not implemented (see comment on line 107)
   - Could cache tool definitions for additional savings
   - Would need to manage cache breakpoint ordering

2. **Tiered Pricing Support**: Framework exists for tiered pricing based on context window
   - Could optimize cache strategy based on pricing tiers
   - Currently not used for Anthropic models

3. **Thinking Budget Pricing**: Framework exists (lines 46-50 in cost.ts)
   - Could apply different output pricing for extended thinking mode
   - Needs tier support for thinking budgets

## References

- Anthropic Prompt Caching Documentation: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Code locations:
  - Main implementation: `src/core/api/providers/anthropic.ts`
  - Message formatting: `src/core/api/transform/anthropic-format.ts`
  - Cost calculation: `src/utils/cost.ts`
  - Tests: `src/utils/cost.test.ts`

## Conclusion

The prompt caching implementation in Cline is a sophisticated system that:
- Automatically caches system prompts for maximum cost savings
- Uses a rolling cache strategy for conversation history
- Properly handles cache control markers according to Anthropic's API requirements
- Accurately tracks and calculates costs for different token types
- Integrates with multiple API providers while maintaining consistent behavior

The implementation demonstrates best practices for production use of Anthropic's prompt caching feature, with proper error handling, cost tracking, and model-specific behavior.
