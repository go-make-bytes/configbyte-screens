// An assistant's name, as the register takes it: 1 to 100 characters on one line.
// Checked here first so a name the register would refuse is said in words before
// anything is sent; the register still judges it, and whether another assistant
// is already called so.

/** The most characters an assistant's name may have. */
export const NAME_MOST = 100

/** The characters that end a line: line feed, carriage return, the line and paragraph separators. */
const LINE_ENDS = new Set([0x0a, 0x0d, 0x2028, 0x2029])

/** Why a name, already trimmed, cannot be an assistant's: a key below `configbyte.people.refused`, or empty. */
export function nameProblem(name: string): '' | 'assistantNoName' | 'assistantInvalid' {
  if (!name) return 'assistantNoName'
  const chars = [...name]
  if (chars.length > NAME_MOST || chars.some((c) => LINE_ENDS.has(c.codePointAt(0)!))) return 'assistantInvalid'

  return ''
}
