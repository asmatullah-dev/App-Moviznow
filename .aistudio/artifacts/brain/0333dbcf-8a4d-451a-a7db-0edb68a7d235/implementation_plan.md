# Implementation Plan - Optimize PlayerFU Controls & Fullscreen Experience

Eliminate redundant overlay title from PlayerFU, maximize horizontal room on mobile screens to restore Play4U's native fullscreen button, and provide a backup dedicated fullscreen control.

---

## 1. User Alignment & Problem Analysis

1. **Title Redundancy**: Play4U already renders the media title and metadata natively inside its player iframe. Our custom text overlay in `PlayerFU.tsx` duplicates this and clutters the interface.
2. **Missing/Clipped Fullscreen Button**: On mobile devices, container padding (`p-2`) and rounded corner clipping (`rounded-2xl overflow-hidden`) squeeze the iframe width below ~350px. When horizontal space is restricted, Play4U's responsive control bar collapses or hides the fullscreen button.
3. **User Preference**:
   - Remove the custom movie title completely from `PlayerFU.tsx`.
   - Maximize space so Play4U's native fullscreen button can render without clipping.
   - Add a fallback dedicated fullscreen toggle button in the player header next to the close button so full screen is guaranteed on all screen sizes.

---

## 2. Proposed Changes

### Component: `src/components/PlayerFU.tsx`

1. **Remove Title Overlay**:
   - Remove the title element and container (`<span className="text-white font-bold ...">{content.title}</span>`) from the header bar.
   - Clean up any unused title wrapper divs.

2. **Mobile Viewport Optimization (Zero Margin/Radius on Mobile)**:
   - Change backdrop padding from `p-2 sm:p-4` to `p-0 sm:p-4` to give the iframe full viewport width on mobile phones.
   - Change card rounded corners from `rounded-2xl` to `rounded-none sm:rounded-2xl` so corner radii do not mask or clip bottom-right controls in portrait mode.
   - Ensure the iframe has explicit `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"` and `allowFullScreen`.

3. **Dedicated Fullscreen Button in Header**:
   - Add a fullscreen toggle button (`Maximize` / `Minimize` from `lucide-react`) alongside the close (`X`) button in the top-right control cluster.
   - Connect it to standard Fullscreen API with vendor prefix support (`requestFullscreen`, `webkitRequestFullscreen`, `exitFullscreen`).
   - Listen for `fullscreenchange` events to keep icon state in sync.

---

## 3. Verification & Testing

1. **Compilation Check**: Run `compile_applet` and `lint_applet` to verify clean build and no TypeScript or lint issues.
2. **Visual & Responsive Testing**:
   - Verify top bar only contains the control buttons (Fullscreen & Close).
   - Verify on mobile viewports (<640px) that the player spans edge-to-edge without corner clipping.
   - Test fullscreen button toggles full screen cleanly.
