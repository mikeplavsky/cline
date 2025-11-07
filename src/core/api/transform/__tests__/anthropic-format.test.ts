import { describe, it } from "mocha"
import "should"
import { sanitizeAnthropicMessages } from "../anthropic-format"
import { MessageParam } from "@anthropic-ai/sdk/resources/index"

describe("sanitizeAnthropicMessages", () => {
	describe("without cache control indices", () => {
		it("should convert string content to structured format", () => {
			const messages: MessageParam[] = [
				{
					role: "user",
					content: "Hello, how are you?",
				},
			]

			const result = sanitizeAnthropicMessages(messages)

			result.should.have.length(1)
			result[0].should.have.property("role", "user")
			result[0].should.have.property("content")
			const content = result[0].content as any[]
			content.should.be.an.Array()
			content.should.have.length(1)
			content[0].should.have.property("type", "text")
			content[0].should.have.property("text", "Hello, how are you?")
			content[0].should.not.have.property("cache_control")
		})

		it("should preserve array content without cache control", () => {
			const messages: MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "Part 1" },
						{ type: "text", text: "Part 2" },
					],
				},
			]

			const result = sanitizeAnthropicMessages(messages)

			result.should.have.length(1)
			const content = result[0].content as any[]
			content.should.have.length(2)
			content[0].should.not.have.property("cache_control")
			content[1].should.not.have.property("cache_control")
		})

		it("should handle multiple messages", () => {
			const messages: MessageParam[] = [
				{ role: "user", content: "First message" },
				{ role: "assistant", content: "First response" },
				{ role: "user", content: "Second message" },
			]

			const result = sanitizeAnthropicMessages(messages)

			result.should.have.length(3)
			result.forEach((msg) => {
				const content = msg.content as any[]
				content.should.be.an.Array()
				content.forEach((c) => {
					c.should.not.have.property("cache_control")
				})
			})
		})
	})

	describe("with cache control indices", () => {
		it("should add cache_control to last user message with string content", () => {
			const messages: MessageParam[] = [
				{ role: "user", content: "First message" },
				{ role: "assistant", content: "First response" },
				{ role: "user", content: "Second message" },
			]

			const lastUserMsgIndex = 2
			const secondLastMsgUserIndex = 0

			const result = sanitizeAnthropicMessages(messages, lastUserMsgIndex, secondLastMsgUserIndex)

			result.should.have.length(3)

			// Last user message should have cache_control
			const lastUserContent = result[2].content as any[]
			lastUserContent.should.have.length(1)
			lastUserContent[0].should.have.property("cache_control")
			lastUserContent[0].cache_control.should.have.property("type", "ephemeral")

			// Second to last user message should have cache_control
			const secondLastUserContent = result[0].content as any[]
			secondLastUserContent.should.have.length(1)
			secondLastUserContent[0].should.have.property("cache_control")
			secondLastUserContent[0].cache_control.should.have.property("type", "ephemeral")

			// Assistant message should not have cache_control
			const assistantContent = result[1].content as any[]
			assistantContent[0].should.not.have.property("cache_control")
		})

		it("should add cache_control only to last content block in array content", () => {
			const messages: MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "Part 1" },
						{ type: "text", text: "Part 2" },
						{ type: "text", text: "Part 3" },
					],
				},
			]

			const lastUserMsgIndex = 0

			const result = sanitizeAnthropicMessages(messages, lastUserMsgIndex, undefined)

			const content = result[0].content as any[]
			content.should.have.length(3)

			// Only last content block should have cache_control
			content[0].should.not.have.property("cache_control")
			content[1].should.not.have.property("cache_control")
			content[2].should.have.property("cache_control")
			content[2].cache_control.should.have.property("type", "ephemeral")
		})

		it("should handle rolling cache with multiple user messages", () => {
			const messages: MessageParam[] = [
				{ role: "user", content: "Message 1" },
				{ role: "assistant", content: "Response 1" },
				{ role: "user", content: "Message 2" },
				{ role: "assistant", content: "Response 2" },
				{ role: "user", content: "Message 3" },
			]

			const lastUserMsgIndex = 4
			const secondLastMsgUserIndex = 2

			const result = sanitizeAnthropicMessages(messages, lastUserMsgIndex, secondLastMsgUserIndex)

			result.should.have.length(5)

			// First user message (index 0) should NOT have cache_control
			const firstUserContent = result[0].content as any[]
			firstUserContent[0].should.not.have.property("cache_control")

			// Second user message (index 2) should have cache_control
			const secondUserContent = result[2].content as any[]
			secondUserContent[0].should.have.property("cache_control")

			// Third user message (index 4) should have cache_control
			const thirdUserContent = result[4].content as any[]
			thirdUserContent[0].should.have.property("cache_control")

			// Assistant messages should not have cache_control
			const response1Content = result[1].content as any[]
			const response2Content = result[3].content as any[]
			response1Content[0].should.not.have.property("cache_control")
			response2Content[0].should.not.have.property("cache_control")
		})
	})

	describe("reasoning details removal", () => {
		it("should remove reasoning_details from text content", () => {
			const messages: MessageParam[] = [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: "Test message",
							reasoning_details: { some: "data" },
						} as any,
					],
				},
			]

			const result = sanitizeAnthropicMessages(messages)

			const content = result[0].content as any[]
			content[0].should.have.property("text", "Test message")
			content[0].should.not.have.property("reasoning_details")
		})

		it("should preserve non-text content types", () => {
			const messages: MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "..." } },
						{ type: "text", text: "Description" },
					],
				},
			]

			const result = sanitizeAnthropicMessages(messages)

			const content = result[0].content as any[]
			content.should.have.length(2)
			content[0].should.have.property("type", "image")
			content[1].should.have.property("type", "text")
		})

		it("should handle mixed content with reasoning details and cache control", () => {
			const messages: MessageParam[] = [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: "Part 1",
							reasoning_details: { detail: "value" },
						} as any,
						{
							type: "text",
							text: "Part 2",
							reasoning_details: { another: "detail" },
						} as any,
					],
				},
			]

			const lastUserMsgIndex = 0

			const result = sanitizeAnthropicMessages(messages, lastUserMsgIndex, undefined)

			const content = result[0].content as any[]
			content.should.have.length(2)

			// First part should not have reasoning_details or cache_control
			content[0].should.not.have.property("reasoning_details")
			content[0].should.not.have.property("cache_control")

			// Second part should not have reasoning_details but should have cache_control
			content[1].should.not.have.property("reasoning_details")
			content[1].should.have.property("cache_control")
		})
	})

	describe("edge cases", () => {
		it("should handle empty messages array", () => {
			const messages: MessageParam[] = []

			const result = sanitizeAnthropicMessages(messages)

			result.should.have.length(0)
		})

		it("should handle undefined cache indices gracefully", () => {
			const messages: MessageParam[] = [{ role: "user", content: "Test" }]

			const result = sanitizeAnthropicMessages(messages, undefined, undefined)

			result.should.have.length(1)
			const content = result[0].content as any[]
			content[0].should.not.have.property("cache_control")
		})

		it("should handle -1 cache indices (no user messages found)", () => {
			const messages: MessageParam[] = [{ role: "assistant", content: "Only assistant message" }]

			const result = sanitizeAnthropicMessages(messages, -1, -1)

			result.should.have.length(1)
			// Should not crash and should not add cache_control
			const content = result[0].content as any[]
			content[0].should.not.have.property("cache_control")
		})

		it("should preserve message structure for already structured content", () => {
			const messages: MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "Already structured" },
					],
				},
			]

			const result = sanitizeAnthropicMessages(messages)

			const content = result[0].content as any[]
			content.should.have.length(1)
			content[0].should.have.property("type", "text")
			content[0].should.have.property("text", "Already structured")
		})
	})
})
