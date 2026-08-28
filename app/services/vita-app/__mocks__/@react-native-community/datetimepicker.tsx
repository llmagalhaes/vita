// Manual mock (auto-applied for node_modules): the picker is a native dialog/wheel
// that can't render under jest. A plain View keeps its props — so a test can still
// `fireEvent(picker, "change", { type: "set" }, someDate)` and drive the seam.
import { View } from "react-native";
export default View;
