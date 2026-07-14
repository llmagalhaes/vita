// Route placeholder: /home keeps its URL (deep links, redirects, pill active
// state) but the real Today screen is rendered by the always-mounted TabsPager
// in _layout.tsx (co-mounted with Trends/Habits for swipe). See src/nav/TabsPager.
export default function HomeRoute() {
  return null;
}
