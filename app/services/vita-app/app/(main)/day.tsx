// Route placeholder: the Day panel is rendered by PanelShell (_layout.tsx), which
// co-mounts all three panels for the edge-swipe. The route only keeps the URL
// alive (deep links, `router.replace("/day")`, the panel tabs). See src/nav/PanelShell.
export default function DayRoute() {
  return null;
}
