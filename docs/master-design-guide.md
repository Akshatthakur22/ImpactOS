Master Design Guide
IMPACT ACADEMY
Product design system • Version 1.0 • 18 October 2026
ATHLETIXOS • MASTER DESIGN GUIDE 2
How to use this document
Use this guide as the shared contract for product design and implementation. Designers use it to create screens and
prototypes; developers use it to implement tokens and components; reviewers use it to assess quality and consistency.
This guide is product-specific. It translates the supplied Apple editorial and design references into requirements for
AthletixOS rather than copying Apple’s branding or interface.
Contents
1. Purpose and authority
2. Product context
3. Design principles
4. Brand and visual direction
5. Design tokens
6. Typography and content
7. Layout and responsive behavior
8. Information architecture and modules
9. Core components
10. Interaction and motion
11. States and feedback
12. Accessibility and inclusive use
13. Data display and domain rules
14. Security and trust in the interface
15. Engineering implementation contract
16. Quality gates and review checklist
17. Screen-level acceptance criteria
18. Anti-patterns and decision rules
19. Delivery roadmap
20. Source notes and scope
ATHLETIXOS • MASTER DESIGN GUIDE 3
1. Purpose and authority
Purpose. This document defines the shared visual language, interaction behavior, information architecture, accessibility
expectations, and implementation rules for Impact Academy — AthletixOS. It is the single design reference for the public
site, administrator ERP, coach portal, and parent portal.
Design intent. Create a premium, calm, human-friendly sports academy product. It should feel considered and
responsive—not like a generic corporate ERP, a sports betting product, or a decorative Dribbble concept.
Source interpretation. The supplied Apple Style Guide (June 2026) is used as an editorial reference for consistent, clear
user-facing language, terminology, inclusive writing, and international formatting. The supplied Apple Design notes inform
principles for direct response, spatial consistency, restraint, materials, typography, motion, and accessibility. AthletixOS
must have its own brand identity; do not copy Apple logos, proprietary assets, or claim this is an official Apple design
system.
Authority order. 1) Product requirements and safety/privacy constraints; 2) this master guide; 3) shared design tokens
and components in code; 4) page-specific implementation. If a page conflicts with this guide, document the reason or
bring it back into alignment.
2. Product context
Product. Impact Academy — AthletixOS: a multi-portal sports academy operations platform for a centralized academy
operating across multiple physical branches.
Primary users. OWNER/STAFF: desktop-first operations, configuration, oversight, finance, reporting. COACH:
mobile-first class execution, attendance, session notes, and student progress. PARENT: mobile-first view of their child’s
schedule, attendance, progress, payments, and announcements.
Platform surfaces. Public marketing website at /; unified sign-in at /login; parent portal at /parent; coach portal at /coach;
administrator ERP at /admin; versioned API at /api/v1.
Core operating model. Academy → Branch → Program/Sport → Batch → Schedule → Session → Attendance. Keep
this model consistent in labels, navigation, filters, breadcrumbs, and data relationships.
Multi-tenancy. All academy-owned data and operations must be scoped by academyId on the server. Visual hiding is not
authorization. Role permissions must be enforced at the API/service layer and reflected clearly in the UI.
Technology context. Next.js App Router, TypeScript, Tailwind CSS, shadcn-style primitives, Zustand for appropriate
client state, TanStack Query for server state, Next.js Route Handlers, service and repository layers, PostgreSQL on Neon
with Drizzle ORM, JWT access/refresh with secure cookies, and Vercel deployment.
3. Design principles
Purpose. Every screen has a clear job. Remove elements that do not help users understand, decide, or act.
Agency. Users stay in control. Prefer undo and reversible actions; confirm only destructive or genuinely consequential
actions.
Responsibility. Protect personal, child, payment, and operational data. Ask for permissions only when needed and
explain why.
Familiarity. Use familiar web patterns and stable placement. Similar controls must look and behave alike.
Flexibility. Adapt to desktop operations, mobile quick tasks, keyboard use, different text sizes, and reduced-motion
preferences.
Simplicity. Simplify the task, not merely the screen. Keep common actions visible and advanced options discoverable
but secondary.
Craft. Typography, alignment, loading states, error handling, responsiveness, and data accuracy are part of product
quality.
ATHLETIXOS • MASTER DESIGN GUIDE 4
Delight. Earn delight through speed, clarity, reassuring feedback, and thoughtful details—not confetti or constant
animation.
4. Brand and visual direction
Personality. Confident, active, warm, precise, and trustworthy. Sports energy should come from purposeful accents, real
academy imagery, and progress visualization—not aggressive gradients or excessive neon.
Visual language. Use generous whitespace where it helps scanning; dense, well-structured tables where operations
require them; restrained borders; soft elevation; strong typography hierarchy; and clear state colors.
Apple-inspired, not Apple-copied. Use platform-aware system typography and polished interaction principles where
appropriate, but keep AthletixOS colors, logo, icon language, and component decisions original. Glass/translucency is
optional and should never reduce contrast or readability.
Photography. Prefer authentic academy, coach, and training imagery with permission. Avoid generic stock-photo hero
banners when real academy imagery is available. Never use imagery as a substitute for accessible text.
Avoid. Overdecorated dashboards, every metric in a card, rainbow charts, huge empty hero sections in operational
screens, excessive blur, tiny grey text, unnecessary gradients, fake data in production, and animations that delay work.
5. Design tokens
Color strategy. Use semantic tokens, not hard-coded colors scattered across components. The proposed palette is a
starting point; validate contrast and confirm it against the existing brand assets before release.
Core tokens. Brand blue #2563EB; brand blue hover #1D4ED8; ink #111827; secondary text #4B5563; muted text
#6B7280; canvas #F7F8FA; surface #FFFFFF; subtle surface #F3F4F6; border #E5E7EB; success #15803D; warning
#B45309; danger #B91C1C; info #0369A1.
Color usage. Brand color is for primary actions, selected navigation, links, and meaningful emphasis.
Success/warning/danger communicate state only. Never communicate status by color alone; pair it with text or an icon.
Dark mode. Support only when each surface, chart, border, and status token has a reviewed dark counterpart. Do not
simply invert colors. Ensure chart palettes and focus indicators remain legible.
Spacing scale. Use a consistent 4 px base scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Prefer tokens over arbitrary one-off
spacing.
Radii. Small controls: 8 px; standard inputs and buttons: 10 px; cards: 14–16 px; large panels: 20 px. Use one radius
family consistently rather than rounding every element maximally.
Elevation. Default cards should rely on surface contrast and borders. Use soft shadows only for floating menus, dialogs,
drawers, and important overlays. Elevation must indicate hierarchy, not decoration.
Borders. Use subtle neutral borders for tables, inputs, separators, and card boundaries. Avoid strong outlines around
every nested region.
6. Typography and content
Typeface. Default to a native system sans-serif stack for speed and platform familiarity. Use a custom brand typeface
only if licensed, tested, and justified. Typography must remain readable on Windows, macOS, Android, and iOS.
Type scale. Display/marketing: 36–48 px; page title: 28–32 px desktop and 24–28 px mobile; section title: 18–22 px;
body: 14–16 px; supporting text: 12–14 px; data labels: generally 12 px minimum, with critical values never relying on tiny
text.
Hierarchy. Create hierarchy with size, weight, line-height, and spacing together. Large headings can use slightly tighter
tracking; body copy should remain natural and readable. Avoid using bold on everything.
Voice. Plain, direct, respectful, and action-oriented. Explain the next step. Avoid jargon, blame, vague system language,
and overly cheerful copy during errors or payment failures.
ATHLETIXOS • MASTER DESIGN GUIDE 5
Labels. Prefer specific navigation names such as Students, Batches, Schedule, Attendance, Payments, and Reports
over vague labels such as Workspace or Manage.
Buttons. Start with a verb when practical: Add student, Record attendance, Create batch, Download report. Use one
primary action per visual region when possible.
Terminology. Use ‘administrator’ in formal documentation and ‘Admin’ only where the product UI needs a compact role
label. Use ‘sign in’ as a verb and ‘sign-in’ as a noun/adjective. Use consistent capitalization for navigation and page titles.
Inclusive writing. Use respectful, neutral language. Do not assume family structure, gender, ability, or financial
circumstances. Prefer ‘Parent or guardian’ when appropriate. Provide meaningful empty-state text and avoid blaming
users.
7. Layout and responsive behavior
Admin desktop. Optimize /admin for 1280 px and wider, but support down to tablet widths. Use a persistent left
navigation on wide screens, a compact/collapsible navigation at intermediate widths, and a drawer on small screens.
Parent and coach mobile. Design /parent and /coach mobile-first. Put the most time-sensitive task first. Use large touch
targets, short task flows, and bottom navigation only for a small set of top-level destinations.
Content width. Keep reading and form content to a comfortable width. Data tables may use the available width but
should not become visually unstructured. Use responsive columns and explicit overflow behavior.
Page skeleton. 1) Global shell; 2) page title and short context; 3) primary action; 4) key filters or tabs; 5) main content; 6)
secondary context. Do not force this exact skeleton onto every page if it harms the task.
Grid. Use a consistent spacing rhythm. On desktop, dashboards can use a 12-column conceptual grid; on mobile, stack
sections in task priority order rather than preserving desktop card order mechanically.
Navigation. Highlight the current section and preserve navigation placement. Show breadcrumbs for deep admin
workflows. Never rely on color alone to indicate the active route.
Sticky elements. Sticky headers and action bars should help long workflows. Ensure they do not cover focused fields,
validation messages, or anchor targets.
8. Information architecture and modules
Global shell. Academy selector only if the user legitimately has access to multiple academies; global search where it has
reliable results; notifications; help; profile and sign-out.
Admin navigation. Overview; Inquiries & Admissions; Students; Coaches; Branches; Programs/Sports; Batches;
Schedule & Sessions; Attendance; Performance; Payments; Expenses & Payouts; Communication; Reports; Settings.
Coach navigation. Today; My Schedule; Attendance; My Batches; Student Progress; Notes; Notifications; Profile. Keep
daily class execution at the top.
Parent navigation. Overview; Schedule; Attendance; Progress; Payments; Announcements; Profile. Show only children
associated with the authenticated parent/guardian.
Calendar as operations center. Schedule and calendar views should connect branches, programs, batches, coaches,
sessions, capacity, and attendance. Calendar items must provide enough context to identify the session and take the
next action.
Role-based visibility. Only show actions that are available to the current role, but still enforce authorization server-side.
Explain unavailable actions when the user needs to understand a workflow dependency.
9. Core components
Buttons. Variants: primary, secondary, tertiary/ghost, destructive, and icon-only. Include hover, pressed, focus-visible,
disabled, and loading states. Loading labels should preserve the action context.
