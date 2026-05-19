export const OVERRIDES_GUIDE = `# Framer Code Overrides Guide

- Code Overrides are small React functions that modify layer props/functionality in preview and published sites.
- Prefer Framer first-class features for simple animation, interaction, and dynamic data when they cover the use case.
- Overrides must be React 18 compatible.
- When wrapping a layer, preserve existing props and forward refs so Framer effects, links, and layout behavior keep working.
- Avoid replacing core attributes like class/className. If absolutely necessary, merge with the existing value.
- Preserve existing event handlers unless the goal explicitly replaces them.
- Typecheck through Framer before applying code changes.

Typical shape:

\`\`\`tsx
import { forwardRef, type ComponentType } from "react"

export function withExample(Component): ComponentType {
  return forwardRef((props, ref) => {
    return <Component ref={ref} {...props} />
  })
}
\`\`\`
`
