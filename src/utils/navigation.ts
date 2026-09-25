/**
 * Navigation utility for content browsing and details history stack.
 * Resolves back navigation issues when opening recommended/similar movies
 * and ensures returning to the original browse page (Home with filters, Favorites, etc.).
 */

export function isContentPath(path: string): boolean {
  return /^\/(movie|series)\//.test(path);
}

/**
 * Clear all movie details navigation history stack and root location trackers.
 * Called when user explicitly navigates to Home.
 */
export function clearMovieDetailsHistory() {
  try {
    sessionStorage.setItem("cleared_movie_history", "true");
    sessionStorage.removeItem("movie_nav_stack");
    sessionStorage.removeItem("last_root_browse_location");
    sessionStorage.removeItem("last_browse_location");
    sessionStorage.removeItem("from_movie_details");
  } catch (err) {
    console.error("Failed to clear movie details history:", err);
  }
}

/**
 * Record navigation when user clicks a movie or series card.
 * If currently on a browse page (e.g. '/', '/favorites', '/freemovies'), it records
 * the root browse location and initializes the history stack.
 * If already on a movie/series page, it pushes the current content page onto the stack.
 */
export function recordNavigationToContent(currentLocation: string) {
  try {
    sessionStorage.removeItem("cleared_movie_history");
    if (!currentLocation) return;

    if (!isContentPath(currentLocation)) {
      // Main browse location (Home, Favorites, FreeMovies, etc.)
      sessionStorage.setItem("last_root_browse_location", currentLocation);
      sessionStorage.setItem("last_browse_location", currentLocation);
      sessionStorage.setItem("movie_nav_stack", JSON.stringify([currentLocation]));
    } else {
      // Navigating from one content details page to another (e.g. Recommended tab)
      let stack: string[] = [];
      try {
        const raw = sessionStorage.getItem("movie_nav_stack");
        stack = raw ? JSON.parse(raw) : [];
      } catch {
        stack = [];
      }
      if (!Array.isArray(stack)) stack = [];

      // Ensure root location exists as base of stack
      const root = sessionStorage.getItem("last_root_browse_location") || "/";
      if (stack.length === 0) {
        stack.push(root);
      }

      // Avoid pushing duplicate current location
      if (stack[stack.length - 1] !== currentLocation) {
        stack.push(currentLocation);
      }

      sessionStorage.setItem("movie_nav_stack", JSON.stringify(stack));
    }
  } catch (err) {
    console.error("Failed to record navigation to content:", err);
  }
}

/**
 * Get target location when user clicks the Back button on a movie/series page.
 * Pops the previous page from the stack.
 * If stack has history, steps back to the previous movie.
 * When the first movie's Back button is clicked, it returns to the originating browse location.
 */
export function getContentBackTarget(currentLocation: string): string {
  try {
    sessionStorage.setItem("from_movie_details", "true");

    let stack: string[] = [];
    try {
      const raw = sessionStorage.getItem("movie_nav_stack");
      stack = raw ? JSON.parse(raw) : [];
    } catch {
      stack = [];
    }
    if (!Array.isArray(stack)) stack = [];

    // Remove any trailing entries matching the current location
    while (stack.length > 0 && stack[stack.length - 1] === currentLocation) {
      stack.pop();
    }

    if (stack.length > 0) {
      const target = stack.pop()!;
      sessionStorage.setItem("movie_nav_stack", JSON.stringify(stack));
      sessionStorage.setItem("last_browse_location", target);
      return target;
    }

    // Stack is empty or exhausted: return to root browse location or Home
    const root = sessionStorage.getItem("last_root_browse_location");
    const last = sessionStorage.getItem("last_browse_location");

    sessionStorage.setItem("movie_nav_stack", JSON.stringify([]));

    if (root && !isContentPath(root)) {
      sessionStorage.setItem("last_browse_location", root);
      return root;
    }
    if (last && !isContentPath(last)) {
      sessionStorage.setItem("last_browse_location", last);
      return last;
    }

    sessionStorage.setItem("last_browse_location", "/");
    return "/";
  } catch {
    return "/";
  }
}
