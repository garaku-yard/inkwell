import type { ProjectElement, Scene } from "@/services/project"

export type IFValue = string | number | boolean
export type IFVariableType = "string" | "number" | "boolean"
export type IFVariables = Record<string, IFValue>

export interface IFVariableDefinition {
  name: string
  type: IFVariableType
  initialValue: IFValue
}

export interface IFTestState {
  id: string
  name: string
  passageId: string
  variables: IFVariables
}

export interface IFStorySettings {
  startPassageId?: string
  variables: IFVariableDefinition[]
  testStates: IFTestState[]
}

export interface IFPassageMetadata {
  tags: string[]
  color: string
  story?: IFStorySettings
}

export const EMPTY_IF_STORY_SETTINGS: IFStorySettings = { variables: [], testStates: [] }
export const EMPTY_IF_PASSAGE_METADATA: IFPassageMetadata = { tags: [], color: "" }

const METADATA_PREFIX = "inkwell-if:v1:"
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

export function parsePassageMetadata(content: string | null | undefined): IFPassageMetadata {
  if (!content?.startsWith(METADATA_PREFIX)) return { ...EMPTY_IF_PASSAGE_METADATA }
  try {
    const raw = JSON.parse(content.slice(METADATA_PREFIX.length)) as Partial<IFPassageMetadata>
    return {
      tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
      color: typeof raw.color === "string" ? raw.color : "",
      story: raw.story ? normalizeStorySettings(raw.story) : undefined,
    }
  } catch {
    return { ...EMPTY_IF_PASSAGE_METADATA }
  }
}

export function serializePassageMetadata(metadata: IFPassageMetadata): string {
  const normalized: IFPassageMetadata = {
    tags: [...new Set(metadata.tags.map((tag) => tag.trim()).filter(Boolean))],
    color: metadata.color.trim(),
  }
  if (metadata.story) normalized.story = normalizeStorySettings(metadata.story)
  return METADATA_PREFIX + JSON.stringify(normalized)
}

function normalizeStorySettings(settings: IFStorySettings): IFStorySettings {
  const normalized: IFStorySettings = {
    variables: Array.isArray(settings.variables)
      ? settings.variables.filter((item) => item && VARIABLE_NAME.test(item.name) && isIFValue(item.initialValue)).map((item) => ({
          name: item.name,
          type: valueType(item.initialValue),
          initialValue: item.initialValue,
        }))
      : [],
    testStates: Array.isArray(settings.testStates)
      ? settings.testStates.filter((item) => item && typeof item.name === "string" && typeof item.passageId === "string").map((item) => ({
          id: typeof item.id === "string" && item.id ? item.id : item.name,
          name: item.name,
          passageId: item.passageId,
          variables: normalizeVariables(item.variables),
        }))
      : [],
  }
  if (typeof settings.startPassageId === "string" && settings.startPassageId) normalized.startPassageId = settings.startPassageId
  return normalized
}

function normalizeVariables(input: unknown): IFVariables {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  return Object.fromEntries(Object.entries(input).filter((entry): entry is [string, IFValue] => VARIABLE_NAME.test(entry[0]) && isIFValue(entry[1])))
}

function isIFValue(value: unknown): value is IFValue {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
}

export function valueType(value: IFValue): IFVariableType {
  return typeof value as IFVariableType
}

type Token =
  | { type: "value"; value: IFValue }
  | { type: "variable"; value: string }
  | { type: "operator"; value: string }
  | { type: "left" | "right" }

function tokenize(expression: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < expression.length) {
    const ch = expression[i]
    if (/\s/.test(ch)) { i++; continue }
    if (ch === "(") { tokens.push({ type: "left" }); i++; continue }
    if (ch === ")") { tokens.push({ type: "right" }); i++; continue }
    const op = /^(==|!=|>=|<=|>|<|\+|-|\*|\/)/.exec(expression.slice(i))
    if (op) { tokens.push({ type: "operator", value: op[1] }); i += op[1].length; continue }
    if (ch === "$" ) {
      const match = /^\$([A-Za-z_][A-Za-z0-9_]*)/.exec(expression.slice(i))
      if (!match) throw new Error(`Invalid variable at column ${i + 1}`)
      tokens.push({ type: "variable", value: match[1] }); i += match[0].length; continue
    }
    if (ch === '"' || ch === "'") {
      const quote = ch
      let value = ""
      i++
      while (i < expression.length && expression[i] !== quote) {
        if (expression[i] === "\\" && i + 1 < expression.length) i++
        value += expression[i++]
      }
      if (expression[i] !== quote) throw new Error("Unterminated string")
      i++
      tokens.push({ type: "value", value })
      continue
    }
    const word = /^[^\s()=!<>]+/.exec(expression.slice(i))?.[0]
    if (!word) throw new Error(`Unexpected token at column ${i + 1}`)
    i += word.length
    const lower = word.toLowerCase()
    if (["and", "or", "not"].includes(lower)) tokens.push({ type: "operator", value: lower })
    else if (lower === "true" || lower === "false") tokens.push({ type: "value", value: lower === "true" })
    else if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(word)) tokens.push({ type: "value", value: Number(word) })
    else throw new Error(`Text literal “${word}” must be quoted`)
  }
  return tokens
}

function truthy(value: IFValue): boolean {
  return typeof value === "boolean" ? value : typeof value === "number" ? value !== 0 : value.length > 0
}

export function evaluateExpression(expression: string, variables: IFVariables): IFValue {
  const tokens = tokenize(expression)
  let cursor = 0
  const peek = () => tokens[cursor]
  const consume = () => tokens[cursor++]

  const primary = (): IFValue => {
    const token = consume()
    if (!token) throw new Error("Expected a value")
    if (token.type === "left") {
      const value = or()
      if (consume()?.type !== "right") throw new Error("Expected closing parenthesis")
      return value
    }
    if (token.type === "variable") {
      if (!(token.value in variables)) throw new Error(`Undefined variable $${token.value}`)
      return variables[token.value]
    }
    if (token.type === "value") return token.value
    throw new Error("Expected a value")
  }
  const unary = (): IFValue => {
    const token = peek()
    if (token?.type === "operator" && token.value === "not") { consume(); return !truthy(unary()) }
    if (token?.type === "operator" && token.value === "-") {
      consume()
      const value = unary()
      if (typeof value !== "number") throw new Error("Unary minus requires a number")
      return -value
    }
    return primary()
  }
  const multiply = (): IFValue => {
    let value = unary()
    while (true) {
      const token = peek()
      if (token?.type !== "operator" || !["*", "/"].includes(token.value)) break
      consume()
      const right = unary()
      if (typeof value !== "number" || typeof right !== "number") throw new Error(`${token.value} requires numbers`)
      if (token.value === "/" && right === 0) throw new Error("Cannot divide by zero")
      value = token.value === "*" ? value * right : value / right
    }
    return value
  }
  const additive = (): IFValue => {
    let value = multiply()
    while (true) {
      const token = peek()
      if (token?.type !== "operator" || !["+", "-"].includes(token.value)) break
      consume()
      const right = multiply()
      if (token.value === "+" && typeof value === "string" && typeof right === "string") value += right
      else {
        if (typeof value !== "number" || typeof right !== "number") throw new Error(`${token.value} requires two numbers or two strings for +`)
        value = token.value === "+" ? value + right : value - right
      }
    }
    return value
  }
  const comparison = (): IFValue => {
    const left = additive()
    const token = peek()
    if (token?.type !== "operator" || !["==", "!=", ">", ">=", "<", "<="].includes(token.value)) return left
    consume()
    const right = additive()
    switch (token.value) {
      case "==": return left === right
      case "!=": return left !== right
      case ">": return left > right
      case ">=": return left >= right
      case "<": return left < right
      default: return left <= right
    }
  }
  const and = (): IFValue => {
    let value = comparison()
    while (true) {
      const token = peek()
      if (token?.type !== "operator" || token.value !== "and") break
      consume()
      const right = comparison()
      value = truthy(value) && truthy(right)
    }
    return value
  }
  const or = (): IFValue => {
    let value = and()
    while (true) {
      const token = peek()
      if (token?.type !== "operator" || token.value !== "or") break
      consume()
      const right = and()
      value = truthy(value) || truthy(right)
    }
    return value
  }
  const value = or()
  if (cursor !== tokens.length) throw new Error("Unexpected trailing expression")
  return value
}

export interface SetStatement { name: string; declaredType?: IFVariableType; expression: string }
export interface ConditionalStatement { expression: string; whenTrue: string; whenFalse: string }

export function parseSetStatement(source: string): SetStatement {
  const match = /^\s*\{set\s+\$([A-Za-z_][A-Za-z0-9_]*)(?::(string|number|boolean))?\s+to\s+([\s\S]+)\}\s*$/i.exec(source)
  if (!match) throw new Error("Expected {set $name[:type] to value}")
  return { name: match[1], declaredType: match[2]?.toLowerCase() as IFVariableType | undefined, expression: match[3].trim() }
}

export function parseConditionalStatement(source: string): ConditionalStatement {
  const trimmed = source.trim()
  if (!/^\{if\s/i.test(trimmed) || !trimmed.endsWith("}")) throw new Error("Expected {if condition: result else: result}")
  const inner = trimmed.slice(1, -1).replace(/^if\s+/i, "")
  const colon = inner.indexOf(":")
  if (colon < 1) throw new Error("Conditional needs a colon after its expression")
  const expression = inner.slice(0, colon).trim()
  const branches = inner.slice(colon + 1)
  const elseMatch = /\s+else\s*:/i.exec(branches)
  return {
    expression,
    whenTrue: (elseMatch ? branches.slice(0, elseMatch.index) : branches).trim(),
    whenFalse: elseMatch ? branches.slice(elseMatch.index + elseMatch[0].length).trim() : "",
  }
}

export function applySetStatement(source: string, variables: IFVariables, definitions: IFVariableDefinition[] = []): IFVariables {
  const statement = parseSetStatement(source)
  const value = evaluateExpression(statement.expression, variables)
  const definition = definitions.find((item) => item.name === statement.name)
  const expected = statement.declaredType ?? definition?.type
  if (expected && valueType(value) !== expected) throw new Error(`$${statement.name} expects ${expected}, received ${valueType(value)}`)
  return { ...variables, [statement.name]: value }
}

export function evaluateConditional(source: string, variables: IFVariables): string {
  const statement = parseConditionalStatement(source)
  return truthy(evaluateExpression(statement.expression, variables)) ? statement.whenTrue : statement.whenFalse
}

export interface IFRenderedElement { id: string; type: "body" | "choice"; content: string }
export interface IFExecutionEvent { passageId: string; elementId: string; message: string; variables: IFVariables }
export interface IFPassageResult { elements: IFRenderedElement[]; variables: IFVariables; events: IFExecutionEvent[]; errors: string[] }

export function executePassage(passage: Scene, input: IFVariables, definitions: IFVariableDefinition[] = []): IFPassageResult {
  let variables = { ...input }
  const elements: IFRenderedElement[] = []
  const events: IFExecutionEvent[] = []
  const errors: string[] = []
  for (const element of [...(passage.elements ?? [])].sort((a, b) => a.line_number - b.line_number)) {
    try {
      if (element.element_type === "set") {
        variables = applySetStatement(element.content, variables, definitions)
        const name = parseSetStatement(element.content).name
        events.push({ passageId: passage.id, elementId: element.id, message: `Set $${name} to ${JSON.stringify(variables[name])}`, variables: { ...variables } })
      } else if (element.element_type === "conditional") {
        const content = evaluateConditional(element.content, variables)
        if (content) elements.push({ id: element.id, type: parseLinks(content).length > 0 ? "choice" : "body", content })
        events.push({ passageId: passage.id, elementId: element.id, message: `Evaluated ${parseConditionalStatement(element.content).expression}`, variables: { ...variables } })
      } else if (element.element_type === "body" || element.element_type === "choice") {
        elements.push({ id: element.id, type: element.element_type, content: element.content })
      }
    } catch (error) {
      errors.push(`${element.id}: ${error instanceof Error ? error.message : "Invalid story logic"}`)
    }
  }
  return { elements, variables, events, errors }
}

export function initialVariables(definitions: IFVariableDefinition[]): IFVariables {
  return Object.fromEntries(definitions.map((item) => [item.name, item.initialValue]))
}

export function parseLinks(text: string | null | undefined): Array<{ label: string; target: string }> {
  if (!text) return []
  const links: Array<{ label: string; target: string }> = []
  const re = /\[\[(?:([^\]]*?)\s*->\s*)?([^\]|>]+?)(?:\s*\|[^\]]*)?\]\]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    const target = match[2].trim()
    links.push({ label: match[1]?.trim() || target, target })
  }
  return links
}

export function renamePassageLinks(text: string, previous: string, next: string): string {
  const wanted = previous.trim().toLowerCase()
  return text.replace(/\[\[([^\]]+)\]\]/g, (whole, inner: string) => {
    const arrow = /^(.*?)(\s*->\s*)(.+)$/.exec(inner)
    if (arrow) return arrow[3].trim().toLowerCase() === wanted ? `[[${arrow[1]}${arrow[2]}${next}]]` : whole
    const pipe = /^(.+?)(\s*\|\s*)(.+)$/.exec(inner)
    if (pipe) return pipe[1].trim().toLowerCase() === wanted ? `[[${next}${pipe[2]}${pipe[3]}]]` : whole
    return inner.trim().toLowerCase() === wanted ? `[[${next}]]` : whole
  })
}

export type IFDiagnosticKind = "syntax" | "broken-link" | "dead-end" | "unreachable" | "undefined-variable" | "impossible-condition" | "duplicate-passage"
export interface IFDiagnostic { kind: IFDiagnosticKind; severity: "error" | "warning"; passageId: string; elementId?: string; message: string }

function referencedVariables(expression: string): string[] {
  return [...expression.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1])
}

export function diagnoseStory(passages: Scene[], settings: IFStorySettings): IFDiagnostic[] {
  const diagnostics: IFDiagnostic[] = []
  const names = new Map<string, Scene[]>()
  for (const passage of passages) {
    const key = passage.scene_heading.trim().toLowerCase()
    names.set(key, [...(names.get(key) ?? []), passage])
  }
  for (const group of names.values()) if (group.length > 1) for (const passage of group) diagnostics.push({ kind: "duplicate-passage", severity: "error", passageId: passage.id, message: `Duplicate passage name “${passage.scene_heading}”` })

  const defined = new Set(settings.variables.map((item) => item.name))
  for (const passage of passages) for (const element of passage.elements ?? []) if (element.element_type === "set") {
    try { defined.add(parseSetStatement(element.content).name) } catch { /* syntax diagnostic below */ }
  }
  const adjacency = new Map(passages.map((passage) => [passage.id, new Set<string>()]))
  for (const passage of passages) {
    let linkCount = 0
    for (const element of passage.elements ?? []) {
      let runtimeText = element.content
      try {
        if (element.element_type === "set") {
          const statement = parseSetStatement(element.content)
          for (const name of referencedVariables(statement.expression)) if (!defined.has(name)) diagnostics.push({ kind: "undefined-variable", severity: "error", passageId: passage.id, elementId: element.id, message: `Undefined variable $${name}` })
          continue
        }
        if (element.element_type === "conditional") {
          const statement = parseConditionalStatement(element.content)
          for (const name of referencedVariables(statement.expression)) if (!defined.has(name)) diagnostics.push({ kind: "undefined-variable", severity: "error", passageId: passage.id, elementId: element.id, message: `Undefined variable $${name}` })
          runtimeText = `${statement.whenTrue} ${statement.whenFalse}`
          if (referencedVariables(statement.expression).length === 0 && !truthy(evaluateExpression(statement.expression, {}))) diagnostics.push({ kind: "impossible-condition", severity: "warning", passageId: passage.id, elementId: element.id, message: "Condition is always false" })
        }
      } catch (error) {
        diagnostics.push({ kind: "syntax", severity: "error", passageId: passage.id, elementId: element.id, message: error instanceof Error ? error.message : "Invalid story logic" })
        continue
      }
      if (element.element_type === "note") continue
      for (const link of parseLinks(runtimeText)) {
        linkCount++
        const target = names.get(link.target.toLowerCase())?.[0]
        if (!target) diagnostics.push({ kind: "broken-link", severity: "error", passageId: passage.id, elementId: element.id, message: `Missing passage “${link.target}”` })
        else adjacency.get(passage.id)?.add(target.id)
      }
    }
    if (linkCount === 0) diagnostics.push({ kind: "dead-end", severity: "warning", passageId: passage.id, message: `“${passage.scene_heading || "Untitled"}” has no outgoing choice` })
  }
  const reachable = new Set<string>()
  const visit = (id: string) => { if (reachable.has(id)) return; reachable.add(id); for (const next of adjacency.get(id) ?? []) visit(next) }
  const start = passages.find((passage) => passage.id === settings.startPassageId) ?? passages[0]
  if (start) visit(start.id)
  for (const passage of passages) if (passage.id !== start?.id && !reachable.has(passage.id)) diagnostics.push({ kind: "unreachable", severity: "warning", passageId: passage.id, message: `“${passage.scene_heading || "Untitled"}” cannot be reached from Start` })
  return diagnostics
}

export function compileElementToSugarCube(element: ProjectElement): string {
  if (element.element_type === "note") return ""
  if (element.element_type === "set") {
    const statement = parseSetStatement(element.content)
    return `<<set $${statement.name} = ${toSugarCubeExpression(statement.expression)}>>`
  }
  if (element.element_type === "conditional") {
    const statement = parseConditionalStatement(element.content)
    const otherwise = statement.whenFalse ? `<<else>>${statement.whenFalse}` : ""
    return `<<if ${toSugarCubeExpression(statement.expression)}>>${statement.whenTrue}${otherwise}<</if>>`
  }
  return element.content ?? ""
}

function toSugarCubeExpression(expression: string): string {
  let compiled = ""
  let plain = ""
  let quote = ""
  let escaped = false
  const flushPlain = () => {
    compiled += plain
      .replace(/\band\b/gi, "&&")
      .replace(/\bor\b/gi, "||")
      .replace(/\bnot\b/gi, "!")
      .replace(/!=/g, "!==")
      .replace(/==/g, "===")
    plain = ""
  }
  for (const character of expression) {
    if (quote) {
      compiled += character
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === quote) quote = ""
    } else if (character === '"' || character === "'") {
      flushPlain()
      quote = character
      compiled += character
    } else {
      plain += character
    }
  }
  flushPlain()
  return compiled
}
