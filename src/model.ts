export interface ReferenceEntry {
  readonly url: string
  readonly name?: string
}

export interface RefsConfig {
  readonly version: 1
  readonly references: ReadonlyArray<ReferenceEntry>
}

export const emptyConfig: RefsConfig = {
  version: 1,
  references: []
}

export class RefsError extends Error {
  readonly _tag = "RefsError"

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "RefsError"
  }
}

export const normalizeGitUrl = (url: string): string => {
  const trimmed = url.trim().replace(/\/+$/u, "")
  return trimmed.endsWith(".git") ? trimmed.slice(0, -4) : trimmed
}

export const deriveNameFromUrl = (url: string): string => {
  const normalized = normalizeGitUrl(url)
  const last = normalized.split("/").filter(Boolean).at(-1) ?? ""
  return last
}

export const effectiveName = (entry: ReferenceEntry): string => entry.name ?? deriveNameFromUrl(entry.url)

export const validateName = (name: string): string => {
  if (name.length === 0) {
    throw new RefsError("Reference name cannot be empty")
  }
  if (name === "." || name === "..") {
    throw new RefsError(`Reference name "${name}" is not allowed`)
  }
  if (name.includes("/") || name.includes("\\")) {
    throw new RefsError(`Reference name "${name}" must be a single path segment`)
  }
  return name
}

export const normalizeEntry = (entry: ReferenceEntry): ReferenceEntry => {
  const url = normalizeGitUrl(entry.url)
  const derivedName = validateName(deriveNameFromUrl(url))
  const name = entry.name === undefined ? undefined : validateName(entry.name.trim())
  return name === undefined || name === derivedName ? { url } : { url, name }
}

export const sortConfig = (config: RefsConfig): RefsConfig => ({
  version: 1,
  references: [...config.references].sort((a, b) => effectiveName(a).localeCompare(effectiveName(b)))
})

export const parseConfig = (text: string): RefsConfig => {
  const parsed = JSON.parse(text) as unknown
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    parsed.version !== 1 ||
    !("references" in parsed) ||
    !Array.isArray(parsed.references)
  ) {
    throw new RefsError("refs.json must contain { \"version\": 1, \"references\": [...] }")
  }

  const references = parsed.references.map((entry): ReferenceEntry => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("url" in entry) ||
      typeof entry.url !== "string"
    ) {
      throw new RefsError("Every refs.json reference must contain a string url")
    }

    if ("name" in entry && entry.name !== undefined && typeof entry.name !== "string") {
      throw new RefsError("Reference name must be a string when provided")
    }

    return normalizeEntry({
      url: entry.url,
      name: "name" in entry ? entry.name : undefined
    })
  })

  assertNoDuplicateReferences(references)
  return sortConfig({ version: 1, references })
}

export const formatConfig = (config: RefsConfig): string => `${JSON.stringify(sortConfig(config), null, 2)}\n`

export const assertNoDuplicateReferences = (references: ReadonlyArray<ReferenceEntry>): void => {
  const names = new Set<string>()
  const urls = new Set<string>()

  for (const entry of references) {
    const name = effectiveName(entry)
    const url = normalizeGitUrl(entry.url)

    if (names.has(name)) {
      throw new RefsError(`Reference "${name}" is already configured`)
    }
    if (urls.has(url)) {
      throw new RefsError(`Reference URL "${url}" is already configured`)
    }

    names.add(name)
    urls.add(url)
  }
}

export const findReferenceIndex = (references: ReadonlyArray<ReferenceEntry>, input: string): number => {
  const normalizedInput = normalizeGitUrl(input)
  const derivedInput = deriveNameFromUrl(input)
  return references.findIndex((entry) => {
    const name = effectiveName(entry)
    return name === input || name === derivedInput || normalizeGitUrl(entry.url) === normalizedInput
  })
}
