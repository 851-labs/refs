import { describe, expect, it } from "vitest"
import {
  deriveNameFromUrl,
  findReferenceIndex,
  formatConfig,
  normalizeEntry,
  normalizeGitUrl,
  parseConfig,
  validateName
} from "../src/model.ts"

describe("model", () => {
  it("normalizes git URLs", () => {
    expect(normalizeGitUrl("https://github.com/Effect-TS/effect-smol.git/")).toBe(
      "https://github.com/Effect-TS/effect-smol"
    )
  })

  it("derives names from URLs", () => {
    expect(deriveNameFromUrl("https://github.com/Effect-TS/effect-smol.git")).toBe("effect-smol")
  })

  it("rejects unsafe names", () => {
    expect(() => validateName("../bad")).toThrow("single path segment")
    expect(() => validateName("..")).toThrow("not allowed")
    expect(() => validateName("")).toThrow("empty")
  })

  it("omits redundant name overrides", () => {
    expect(normalizeEntry({ url: "https://github.com/Effect-TS/effect-smol.git", name: "effect-smol" })).toEqual({
      url: "https://github.com/Effect-TS/effect-smol"
    })
  })

  it("parses and formats stable refs.json", () => {
    const config = parseConfig(JSON.stringify({
      version: 1,
      references: [
        { url: "https://github.com/org/z.git" },
        { url: "https://github.com/org/a", name: "custom" }
      ]
    }))

    expect(formatConfig(config)).toBe(`{
  "version": 1,
  "references": [
    {
      "url": "https://github.com/org/a",
      "name": "custom"
    },
    {
      "url": "https://github.com/org/z"
    }
  ]
}
`)
  })

  it("finds references by name, derived URL name, or URL", () => {
    const references = [
      { url: "https://github.com/org/a", name: "custom" },
      { url: "https://github.com/org/b" }
    ]

    expect(findReferenceIndex(references, "custom")).toBe(0)
    expect(findReferenceIndex(references, "https://github.com/org/a.git")).toBe(0)
    expect(findReferenceIndex(references, "b")).toBe(1)
  })
})
