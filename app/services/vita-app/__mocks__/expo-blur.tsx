// Manual mock (auto-applied for node_modules): BlurView is a native view that
// can't render under jest. Stub it as a plain View so sheets/backdrops render.
import { View } from "react-native";
export const BlurView = View;
export const BlurTargetView = View;
