# Prompt Caching Flow Diagram

## Visual Overview of Caching Implementation

### Request Flow with Cache Control

```
┌─────────────────────────────────────────────────────────────────┐
│                     REQUEST 1 (Initial)                         │
└─────────────────────────────────────────────────────────────────┘

API Request:
┌─────────────────────────────────────┐
│ System Prompt (50K tokens)          │ ← cache_control: ephemeral
│ "You are Cline, an AI assistant..." │    [CACHE WRITE: 50K tokens]
├─────────────────────────────────────┤
│ User Message 1                      │ ← cache_control: ephemeral
│ "Hello, help me with this task..."  │    [CACHE WRITE: 2K tokens]
└─────────────────────────────────────┘

Cost: Cache writes + Output
─────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────┐
│                     REQUEST 2 (Continuation)                    │
└─────────────────────────────────────────────────────────────────┘

API Request:
┌─────────────────────────────────────┐
│ System Prompt (50K tokens)          │ ← [CACHE READ: 50K tokens] ✓
│ (retrieved from cache)              │
├─────────────────────────────────────┤
│ User Message 1                      │ ← [CACHE READ: 2K tokens] ✓
│ (retrieved from cache)              │
├─────────────────────────────────────┤
│ Assistant Response 1                │ ← (previous response, not cached)
│ "I'll help you with that..."        │
├─────────────────────────────────────┤
│ User Message 2                      │ ← cache_control: ephemeral
│ "Great! Now do this next step..."   │    [CACHE WRITE: 2K tokens]
└─────────────────────────────────────┘

Cost: Cache reads + Cache writes + New input + Output
─────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────┐
│                     REQUEST 3 (Continuation)                    │
└─────────────────────────────────────────────────────────────────┘

API Request:
┌─────────────────────────────────────┐
│ System Prompt (50K tokens)          │ ← [CACHE READ: 50K tokens] ✓
│ (retrieved from cache)              │
├─────────────────────────────────────┤
│ User Message 1                      │ ← (not in last 2, regular input)
│ (sent as regular input)             │
├─────────────────────────────────────┤
│ Assistant Response 1                │ ← (sent as regular input)
│                                     │
├─────────────────────────────────────┤
│ User Message 2                      │ ← [CACHE READ: 2K tokens] ✓
│ (retrieved from cache)              │
├─────────────────────────────────────┤
│ Assistant Response 2                │ ← (previous response, not cached)
│                                     │
├─────────────────────────────────────┤
│ User Message 3                      │ ← cache_control: ephemeral
│ "Perfect! Continue with..."         │    [CACHE WRITE: 2K tokens]
└─────────────────────────────────────┘

Cost: Cache reads + Cache writes + New input + Output
```

## Code Location Map

```
cline/
├── src/
│   ├── core/
│   │   └── api/
│   │       ├── providers/
│   │       │   └── anthropic.ts ............... Main provider implementation
│   │       │       ├── Lines 99-105 .......... System prompt caching
│   │       │       ├── Lines 80-89 ........... User message index finding
│   │       │       └── Lines 155-161 ......... Cache usage tracking
│   │       │
│   │       └── transform/
│   │           ├── anthropic-format.ts ........ Message transformation
│   │           │   ├── sanitizeAnthropicMessages() ... Main function
│   │           │   ├── Lines 14-40 .......... Cache control addition
│   │           │   └── Lines 61-77 .......... Reasoning removal
│   │           │
│   │           └── __tests__/
│   │               └── anthropic-format.test.ts ... Tests (new)
│   │
│   └── utils/
│       ├── cost.ts ............................ Cost calculations
│       │   ├── calculateApiCostAnthropic() ... Anthropic pricing
│       │   └── Lines 52-62 ................. Cache cost logic
│       │
│       └── cost.test.ts ....................... Cost tests
│
├── docs/
│   ├── PROMPT_CACHING_IMPLEMENTATION.md ....... Full documentation (new)
│   ├── PROMPT_CACHING_SUMMARY.md .............. Quick reference (new)
│   └── PROMPT_CACHING_FLOW.md ................. This file (new)
```

## Token Flow & Pricing

### Claude 3.5 Sonnet Pricing (per million tokens)

```
┌──────────────────────┬──────────────┬─────────────┐
│ Token Type           │ Price        │ vs Regular  │
├──────────────────────┼──────────────┼─────────────┤
│ Regular Input        │ $3.00        │ baseline    │
│ Cache Write          │ $3.75        │ +25%        │
│ Cache Read           │ $0.30        │ -90%        │
│ Output               │ $15.00       │ N/A         │
└──────────────────────┴──────────────┴─────────────┘
```

### Example Conversation Cost Breakdown

```
Request 1 (Initial):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
System Prompt:    50,000 tokens × $3.75/M (cache write) = $0.1875
User Message:      2,000 tokens × $3.75/M (cache write) = $0.0075
Output:            1,000 tokens × $15.00/M              = $0.0150
                                                  Total = $0.2100

Request 2 (Using cache):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
System Prompt:    50,000 tokens × $0.30/M (cache read)  = $0.0150
User Message 1:    2,000 tokens × $0.30/M (cache read)  = $0.0006
New Input:         2,000 tokens × $3.00/M (regular)     = $0.0060
User Message 2:    2,000 tokens × $3.75/M (cache write) = $0.0075
Output:            1,000 tokens × $15.00/M              = $0.0150
                                                  Total = $0.0441

Request 3 (Steady state):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
System Prompt:    50,000 tokens × $0.30/M (cache read)  = $0.0150
New Input:         4,000 tokens × $3.00/M (regular)     = $0.0120
User Message 2:    2,000 tokens × $0.30/M (cache read)  = $0.0006
User Message 3:    2,000 tokens × $3.75/M (cache write) = $0.0075
Output:            1,000 tokens × $15.00/M              = $0.0150
                                                  Total = $0.0501

Total for 3 requests: $0.3042
Without caching:      $0.5130 (3 × $0.171)
Savings:              $0.2088 (40.7% reduction)
```

## Cache Lifecycle Timeline

```
Time    Event                           Cache Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
00:00   Request 1: Initial              Create cache (System + User 1)
        └─ Response received            Cache active
                                        
00:30   Request 2: Follow-up            Cache HIT ✓
        └─ Response received            Cache refreshed (now includes User 2)
                                        
01:00   Request 3: Continue             Cache HIT ✓
        └─ Response received            Cache refreshed (now includes User 3)
                                        
                                        ... 4 minutes of inactivity ...
                                        
05:00   [No activity]                   Cache expires ⌛
                                        
05:30   Request 4: New request          Cache MISS ✗
        └─ Response received            Create new cache
```

## Implementation Decision Tree

```
┌─────────────────────────────────────┐
│   Should this content be cached?    │
└────────────────┬────────────────────┘
                 │
                 ├─── Is it the system prompt?
                 │    └─── YES → Always cache (largest savings)
                 │
                 ├─── Is it a user message?
                 │    └─── Is it one of the last 2 user messages?
                 │         ├─── YES → Cache (rolling window)
                 │         └─── NO → Don't cache
                 │
                 └─── Is it an assistant response?
                      └─── NO → Never cached
                           (changes every request)
```

## Message Structure Transformation

### Before Sanitization

```javascript
{
  role: "user",
  content: "Hello, help me with this task"
}
```

### After Sanitization (with cache control)

```javascript
{
  role: "user",
  content: [
    {
      type: "text",
      text: "Hello, help me with this task",
      cache_control: { type: "ephemeral" }
    }
  ]
}
```

### Multi-part Content (cache on last part only)

```javascript
// Before
{
  role: "user",
  content: [
    { type: "text", text: "Part 1" },
    { type: "text", text: "Part 2" },
    { type: "text", text: "Part 3" }
  ]
}

// After (only last part gets cache_control)
{
  role: "user",
  content: [
    { type: "text", text: "Part 1" },
    { type: "text", text: "Part 2" },
    { 
      type: "text", 
      text: "Part 3",
      cache_control: { type: "ephemeral" }  // ← Only here
    }
  ]
}
```

## Key Insights

### Why This Design?

1. **System Prompt Always Cached**
   - Largest component (~50K tokens)
   - Never changes during a task
   - Highest ROI for caching

2. **Last Two User Messages**
   - Maintains conversation continuity
   - Second-to-last: Used in current request
   - Last: Will be used in next request
   - Creates efficient rolling window

3. **Assistant Messages Not Cached**
   - Change with every response
   - Caching would provide no benefit
   - Included in context but not cached

4. **Ephemeral Cache Type**
   - 5-minute expiration
   - Balances cost and freshness
   - Sufficient for typical conversation flow

### Performance Impact

```
┌────────────────────┬──────────────┬──────────────┬──────────────┐
│ Metric             │ Without Cache│ With Cache   │ Improvement  │
├────────────────────┼──────────────┼──────────────┼──────────────┤
│ Cost per request   │ $0.171       │ $0.036       │ -79%         │
│ Latency (est.)     │ 2.5s         │ 1.2s         │ -52%         │
│ Tokens processed   │ 53,000       │ 3,000        │ -94%         │
└────────────────────┴──────────────┴──────────────┴──────────────┘

* Estimates based on typical conversation with 50K system prompt
```

## Related Documentation

- Full implementation details: `PROMPT_CACHING_IMPLEMENTATION.md`
- Quick reference: `PROMPT_CACHING_SUMMARY.md`
- Anthropic API docs: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching

## Testing Coverage

The test suite (`anthropic-format.test.ts`) validates:

✓ String to structured content conversion
✓ Cache control marker placement
✓ Multi-part content handling
✓ Rolling cache with multiple user messages
✓ Reasoning details removal
✓ Edge cases (empty messages, undefined indices)
✓ Mixed content with cache control
