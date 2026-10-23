# Unified Typewriter Cursor Animation for Home Welcome Banner

Transition the home page welcome greeting from marquee scrolling to an in-place typewriter animation with a blinking text cursor, unifying "Welcome" and the user's name with smooth backspacing and retyping cycles.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following animation behaviors and pacing were confirmed through user clarification:

- **Confirmed Decision 1**: Backspace and retype the complete text (`"Welcome {displayName}"`) together as a single unified sequence, rather than keeping `"Welcome "` static.
- **Confirmed Decision 2**: Display the full text on initial load, pause for 3 seconds for readability, smoothly backspace character-by-character into a blinking cursor, pause briefly, then retype smoothly from left to right.
- **Confirmed Decision 3**: Preserve all existing design achievements: UserProfileMenu-matched Plan & Role badges, beautified expiry date pill with calendar icon, unified header refresh button, bottom separator line, and compact vertical spacing.

---

### 1. Overview & Core Concept

- **What It Does**: Provides a polished, non-scrolling text greeting at the top of the Home media catalog. Instead of sliding text horizontally across the screen, characters erase backwards in place to the start with a blinking cursor indicator (`|`), then type out smoothly character-by-character.
- **Target Audience**: All logged-in VIP, Basic, and Admin users (as well as guests) browsing the home media catalog.
- **Key Value**: Delivers the user's intended "text cursor / backspacing" effect cleanly without layout shift, visual clutter, or horizontal marquee scrolling.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Immediate Initial Presentation**: On opening or refreshing the Home tab, `"Welcome "` + `{displayName}` appears fully visible with high contrast and an emerald accent on the user's name. A subtle blinking cursor rests at the end of the text.
  2. **Reading Pause**: The full greeting remains still for 3 seconds so the user can easily read their name, status, and expiry details.
  3. **In-Place Backspacing**: The text erases backwards from the rightmost character towards the beginning at a smooth, steady cadence (~40ms per character).
  4. **Brief Cursor Pause**: Once fully erased (or at empty state), the cursor blinks for ~350ms.
  5. **Typewriter Retype**: Characters are typed back out one-by-one from the left (~65ms per character) until the full `"Welcome {displayName}"` phrase is restored.
  6. **Loop Continuation**: The cycle resumes with the 3-second reading pause.
- **Visual Identity & Theme**:
  - **Aesthetic Direction**: Modern, high-end entertainment dashboard with subtle cybernetic/typewriter precision.
  - **Color Palette & Styling**:
    - `"Welcome"` prefix in crisp neutral text (`text-zinc-900 dark:text-white font-bold`).
    - User name in vivid emerald (`text-emerald-600 dark:text-emerald-400 font-extrabold`).
    - Active cursor rendered as a rounded vertical bar (`w-[2.5px] h-5 bg-emerald-500 animate-pulse ml-0.5 inline-block align-middle`).
  - **Second Row Preservation**:
    - Plan and role pill labels retaining exact color tokens from `UserProfileMenu.tsx`.
    - Beautified expiry date badge with calendar icon and sparkles for lifetime status.
    - Unified `<HeaderRefreshButton />` component.
    - Minimal vertical footprint with `py-1 mb-2 border-b border-zinc-200/80 dark:border-zinc-800/80`.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: React State-Driven Typewriter Hook vs. CSS Marquee**:
  - *Chosen Approach*: Use a lightweight React `useEffect` interval loop (`useState` for character index and typing/deleting phase).
  - *Why*: CSS marquee causes horizontal motion sickness and text clipping issues. A state-driven character slicing hook gives exact control over character-level deletion, pause durations, cursor blinking, and clean separation between "Welcome" and user name styling.
  - *Alternatives Considered*: CSS `steps()` animation — rejected because variable user name lengths break fixed-step CSS width calculations.
- **Decision 2: Unified String Slicing with Preserved Emerald Highlighting**:
  - *Chosen Approach*: Calculate the sliced length against the composite string `Welcome ${displayName}`. When rendering the visible slice, the first `Welcome `.length characters are styled in white/zinc, and any remaining characters are wrapped in emerald.
  - *Why*: Allows the entire sentence to erase and type as one fluid phrase as requested by the user, while still giving the user's name distinctive accent styling.

---

### 4. Technical Architecture & Component Flow

```
┌────────────────────────────────────────────────────────┐
│                   Home.tsx (/src)                      │
│                           │                            │
│                           ▼                            │
│              UserWelcomeBanner Component               │
│  ┌──────────────────────────────────────────────────┐  │
│  │ State: displayText, phase (idle|deleting|typing) │  │
│  │                                                  │  │
│  │ Line 1: Typewriter Greeting Container            │  │
│  │   ├── "Welcome " (white/zinc)                    │  │
│  │   ├── "{SlicedName}" (emerald-500)               │  │
│  │   └── Cursor Bar ("|" emerald pulse)             │  │
│  │                                                  │  │
│  │ Line 2: Account Badges & Controls                │  │
│  │   ├── Role Badge (VIP / Basic / Admin)           │  │
│  │   ├── Status Badge (Active / Suspended)          │  │
│  │   ├── Beautified Expiry (Calendar + Sparkles)    │  │
│  │   └── Unified HeaderRefreshButton                │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

#### Step-by-Step Implementation Sequence:
1. **Refactor Animation Engine in `UserWelcomeBanner.tsx`**:
   - Remove the `framer-motion` horizontal marquee `x: ["0%", "-100%", "100%", "0%"]`.
   - Add state machine: `fullText = "Welcome " + displayName`.
   - Manage `charCount` from `fullText.length` downwards to `0` (deleting) and `0` upwards to `fullText.length` (typing).
   - Set 3000ms pause when `charCount === fullText.length`.
   - Set 350ms pause when `charCount === 0`.
   - Render the blinking cursor alongside the current sliced string.
2. **Quality Verification**:
   - Run `lint_applet` and `compile_applet` to verify clean build without typescript or runtime errors.
