# Prompt Caching Documentation

This directory contains comprehensive documentation about the Anthropic Prompt Caching implementation in Cline.

## 📚 Documentation Files

### 1. [PROMPT_CACHING_SUMMARY.md](PROMPT_CACHING_SUMMARY.md)
**Start here!** Quick reference guide covering:
- What gets cached and why
- Cost savings examples
- Key implementation files
- Best practices

**Read this if you want:** A fast overview of how caching works in Cline

---

### 2. [PROMPT_CACHING_FLOW.md](PROMPT_CACHING_FLOW.md)
Visual diagrams and flow charts showing:
- Request flow with cache control
- Token flow and pricing breakdowns
- Cache lifecycle timeline
- Message structure transformations

**Read this if you want:** Visual understanding of the caching process

---

### 3. [PROMPT_CACHING_IMPLEMENTATION.md](PROMPT_CACHING_IMPLEMENTATION.md)
Deep technical documentation including:
- Complete code walkthroughs
- Detailed implementation architecture
- Cache lifecycle and expiration
- Integration with other providers
- Future enhancements

**Read this if you want:** Complete technical details and implementation specifics

---

## 🧪 Test Suite

**Location:** `src/core/api/transform/__tests__/anthropic-format.test.ts`

Comprehensive test coverage for:
- Message sanitization with cache control
- Cache marker placement logic
- Reasoning details removal
- Edge cases and error handling

## 🎯 Quick Facts

| Aspect | Details |
|--------|---------|
| **What's cached** | System prompt + last 2 user messages |
| **Cache type** | Ephemeral (5-minute expiration) |
| **Cost savings** | ~79% reduction in typical conversations |
| **Key file** | `src/core/api/providers/anthropic.ts` |
| **Pricing** | Cache reads: 90% cheaper than regular input |

## 📖 Reading Guide

**For different audiences:**

### 🚀 Quick Start (5 minutes)
1. Read [PROMPT_CACHING_SUMMARY.md](PROMPT_CACHING_SUMMARY.md)
2. Look at the cost savings example
3. Check the "Key Implementation Files" section

### 💡 Understanding the Flow (15 minutes)
1. Read [PROMPT_CACHING_SUMMARY.md](PROMPT_CACHING_SUMMARY.md)
2. Review the diagrams in [PROMPT_CACHING_FLOW.md](PROMPT_CACHING_FLOW.md)
3. See the "Request Flow with Cache Control" section

### 🔧 Implementation Details (45 minutes)
1. Start with [PROMPT_CACHING_SUMMARY.md](PROMPT_CACHING_SUMMARY.md) for context
2. Read [PROMPT_CACHING_IMPLEMENTATION.md](PROMPT_CACHING_IMPLEMENTATION.md) thoroughly
3. Review the actual code in the files mentioned
4. Check the test suite for examples

### 🏗️ Building Similar Systems (2 hours)
1. Read all three documentation files
2. Study the code in detail:
   - `src/core/api/providers/anthropic.ts`
   - `src/core/api/transform/anthropic-format.ts`
   - `src/utils/cost.ts`
3. Review the test suite
4. Experiment with the implementation

## 🔑 Key Concepts

### Cache Hierarchy
```
Priority 1: System Prompt (always cached - biggest savings)
Priority 2: Last User Message (for next request)
Priority 3: Second-to-last User Message (for current request)
```

### Why It Works
- **System prompts** are large (~50K tokens) and static
- **Conversation context** builds incrementally
- **Rolling cache** balances cost and context
- **5-minute window** suits typical conversation patterns

### Cost Comparison
```
Without caching:  $0.171 per request
With caching:     $0.036 per request
Savings:          79% reduction
```

## 🔗 External Resources

- [Anthropic Prompt Caching Documentation](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [Claude API Reference](https://docs.anthropic.com/en/api/messages)
- [Pricing Information](https://www.anthropic.com/pricing)

## 🎓 What You'll Learn

After reading this documentation, you'll understand:

✅ How Anthropic's prompt caching works  
✅ Why Cline caches system prompts and user messages  
✅ How the rolling cache strategy maintains context  
✅ How to calculate costs with caching  
✅ How to implement similar caching in your own projects  
✅ Best practices for cache placement and optimization  

## 📝 Contributing

If you find errors or have suggestions for improving this documentation:

1. Check the actual implementation code for accuracy
2. Test your understanding with the test suite
3. Submit improvements via pull request

## ⚠️ Important Notes

- **Not all Claude models support caching** - Check the supported models list
- **Cache expires after 5 minutes** - Plan accordingly for long conversations
- **Minimum token requirements** - Small prompts may not benefit from caching
- **'latest' alias doesn't support cache_control** - Use specific model versions

## 🏆 Credits

This documentation was created by analyzing the Cline codebase implementation of Anthropic's Prompt Caching feature. The implementation demonstrates production-ready best practices and serves as an excellent reference for anyone working with Claude's API.

---

**Last Updated:** 2025-11-07  
**Cline Version:** 3.36.0  
**Anthropic API Version:** Messages API with Prompt Caching
